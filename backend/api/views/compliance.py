import io
import json
import uuid

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.compliance_extractors import extract_compliance_fields
from api.compliance_review import build_review_alerts
from api.compliance_rules import analyze_compliance_text, get_jurisdiction
from api.jwt_auth import jwt_required
from api.models import ComplianceDocument, ComplianceFinding, ComplianceProfile
from api.utils import parse_json

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

PROFILE_TYPES = {'driver', 'vehicle', 'route'}


def _jurisdiction(data):
    code = (data.get('jurisdictionCode') or data.get('jurisdiction_code') or 'UG').upper()[:10]
    code, fallback = get_jurisdiction(code)
    label = data.get('jurisdictionLabel') or data.get('jurisdiction_label') or fallback['label']
    return code, label[:120]


def _extract_upload_text(file_obj):
    name = file_obj.name or 'uploaded-document'
    content_type = file_obj.content_type or ''
    raw = file_obj.read()
    if len(raw) > 10 * 1024 * 1024:
        return '', 'too_large', 'File is larger than the 10 MB backend upload limit.'
    lower_name = name.lower()
    if content_type.startswith('text/') or lower_name.endswith(('.txt', '.md', '.csv', '.json')):
        return raw.decode('utf-8', errors='ignore'), 'text', 'Text extracted from uploaded file.'
    if content_type == 'application/pdf' or lower_name.endswith('.pdf'):
        if PdfReader is None:
            return '', 'pdf_unavailable', 'PDF parser dependency is not installed on this backend.'
        reader = PdfReader(io.BytesIO(raw))
        pages = [(page.extract_text() or '') for page in reader.pages[:20]]
        text = '\n'.join(page for page in pages if page.strip())
        return text, 'pdf', 'PDF text extracted from first 20 pages.' if text else 'PDF uploaded, but no selectable text was found.'
    if content_type.startswith('image/'):
        return '', 'ocr_required', 'Image uploaded. OCR service is required before text can be extracted.'
    return '', 'metadata_only', 'Unsupported file type for text extraction; filename and MIME type were classified.'


def _finding_from_data(document, data):
    rule_id = data.get('ruleId') or data.get('id') or data.get('title') or 'manual-review'
    hits = data.get('hits') or []
    matched_text = data.get('matchedText') or data.get('matched_text') or ', '.join(hits)
    return ComplianceFinding(
        id=str(uuid.uuid4()),
        document_id=document.id,
        user_id=document.user_id,
        jurisdiction_code=document.jurisdiction_code,
        rule_id=str(rule_id)[:80],
        title=(data.get('title') or 'Compliance review')[:160],
        severity=(data.get('severity') or 'info')[:20],
        finding_type=(data.get('type') or 'required')[:30],
        detail=data.get('detail') or data.get('summary') or data.get('description') or '',
        matched_text=matched_text,
    )


def _document_with_findings(document):
    payload = document.to_dict()
    extracted_fields = payload.get('extractedFields') or {}
    findings = ComplianceFinding.objects.filter(document_id=document.id).order_by('-created_at')
    payload['findings'] = [finding.to_dict() for finding in findings]
    payload['matches'] = [
        {
            'id': finding.rule_id,
            'title': finding.title,
            'severity': finding.severity,
            'summary': finding.detail or 'Stored compliance finding',
            'hits': [hit.strip() for hit in (finding.matched_text or '').split(',') if hit.strip()],
            'requiredDocs': [],
        }
        for finding in findings
    ]
    payload['directHit'] = bool(payload['matches'])
    payload['missingDocs'] = []
    _, jurisdiction = get_jurisdiction(document.jurisdiction_code)
    docs_by_rule = {rule['id']: rule['requiredDocs'] for rule in jurisdiction['rules']}
    for match in payload['matches']:
        match['requiredDocs'] = docs_by_rule.get(match['id'], [])
        for required_doc in match['requiredDocs']:
            if required_doc not in payload['missingDocs']:
                payload['missingDocs'].append(required_doc)
    payload['reviewAlerts'] = build_review_alerts(extracted_fields)
    return payload


def _create_document(user_id, data, text='', summary='', status='reviewed'):
    jurisdiction_code, jurisdiction_label = _jurisdiction(data)
    extracted_text = text or data.get('text') or data.get('extractedText') or data.get('extracted_text') or ''
    extracted_fields = data.get('extractedFields') or data.get('extracted_fields') or extract_compliance_fields(extracted_text)
    analysis = analyze_compliance_text(
        jurisdiction_code,
        file_name=data.get('fileName') or data.get('file_name') or '',
        mime_type=data.get('mimeType') or data.get('mime_type') or '',
        text=extracted_text,
    )
    document = ComplianceDocument(
        id=data.get('id') or str(uuid.uuid4()),
        user_id=user_id,
        jurisdiction_code=analysis['jurisdictionCode'],
        jurisdiction_label=data.get('jurisdictionLabel') or data.get('jurisdiction_label') or analysis['jurisdictionLabel'] or jurisdiction_label,
        file_name=(data.get('fileName') or data.get('file_name') or 'Uploaded compliance document')[:255],
        mime_type=(data.get('mimeType') or data.get('mime_type') or '')[:120],
        extracted_text=extracted_text,
        extracted_fields=json.dumps(extracted_fields),
        summary=summary or data.get('summary') or '',
        scan_status=data.get('status') or status,
    )
    document.save()

    for finding_data in data.get('findings') or data.get('matches') or analysis['matches']:
        _finding_from_data(document, finding_data).save()

    payload = _document_with_findings(document)
    payload['directHit'] = analysis['directHit']
    payload['reviewedAt'] = analysis['reviewedAt']
    if analysis['missingDocs']:
        payload['missingDocs'] = analysis['missingDocs']
    return payload


def _profile_payload(data):
    profile_type = (data.get('profileType') or data.get('profile_type') or 'driver').lower()[:30]
    if profile_type not in PROFILE_TYPES:
        profile_type = 'driver'
    jurisdiction_code, _ = _jurisdiction(data)
    profile_data = data.get('data') or {}
    if not isinstance(profile_data, dict):
        profile_data = {}
    return {
        'profile_type': profile_type,
        'jurisdiction_code': jurisdiction_code,
        'title': (data.get('title') or f'{profile_type.title()} compliance profile')[:160],
        'data_json': json.dumps(profile_data),
    }


def _apply_profile_fields(profile, data):
    payload = _profile_payload(data)
    profile.profile_type = payload['profile_type']
    profile.jurisdiction_code = payload['jurisdiction_code']
    profile.title = payload['title']
    profile.data_json = payload['data_json']


def _profile_counts(profiles):
    counts = {'driver': 0, 'vehicle': 0, 'route': 0}
    for profile in profiles:
        counts[profile.profile_type] = counts.get(profile.profile_type, 0) + 1
    return counts


def _fleet_readiness_alerts(profile_counts, severity_counts):
    alerts = []
    missing_profiles = [profile_type for profile_type in ('driver', 'vehicle', 'route') if profile_counts.get(profile_type, 0) == 0]
    if missing_profiles:
        alerts.append({
            'level': 'warning',
            'title': 'Profile coverage incomplete',
            'body': f"Add {', '.join(missing_profiles)} compliance profile records before dispatch review.",
        })
    if severity_counts.get('critical', 0):
        alerts.append({
            'level': 'critical',
            'title': 'Critical compliance findings open',
            'body': 'Review critical uploaded-document findings before releasing a load packet.',
        })
    if not alerts:
        alerts.append({
            'level': 'info',
            'title': 'Dispatch profile baseline ready',
            'body': 'Driver, vehicle, and route profile records are available for the selected jurisdiction.',
        })
    return alerts


def _dispatch_policy(severity_counts):
    if severity_counts.get('critical', 0):
        return {
            'mode': 'block',
            'blocked': True,
            'title': 'Dispatch blocked by critical compliance findings',
            'reasons': ['Resolve critical uploaded-document findings before releasing this load.'],
        }
    return {
        'mode': 'warn',
        'blocked': False,
        'title': 'Dispatch allowed with compliance review',
        'reasons': [],
    }


@jwt_required
@require_http_methods(['GET'])
def compliance_summary(request):
    user_id = request.righand_user_id
    jurisdiction_code = request.GET.get('jurisdictionCode') or request.GET.get('jurisdiction_code')

    documents = ComplianceDocument.objects.filter(user_id=user_id)
    findings = ComplianceFinding.objects.filter(user_id=user_id)
    profiles = ComplianceProfile.objects.filter(user_id=user_id)
    if jurisdiction_code:
        code = jurisdiction_code.upper()[:10]
        documents = documents.filter(jurisdiction_code=code)
        findings = findings.filter(jurisdiction_code=code)
        profiles = profiles.filter(jurisdiction_code=code)

    severity_counts = {'critical': 0, 'warning': 0, 'info': 0}
    for finding in findings:
        severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1

    profile_counts = _profile_counts(profiles)
    latest_document = documents.order_by('-created_at').first()
    return JsonResponse({
        'success': True,
        'documentCount': documents.count(),
        'findingCount': findings.count(),
        'severityCounts': severity_counts,
        'profileCount': profiles.count(),
        'profileCounts': profile_counts,
        'readinessAlerts': _fleet_readiness_alerts(profile_counts, severity_counts),
        'dispatchPolicy': _dispatch_policy(severity_counts),
        'latestDocument': latest_document.to_dict() if latest_document else None,
    })


@jwt_required
@require_http_methods(['GET', 'POST'])
def compliance_profiles(request):
    user_id = request.righand_user_id

    if request.method == 'GET':
        jurisdiction_code = request.GET.get('jurisdictionCode') or request.GET.get('jurisdiction_code')
        profile_type = request.GET.get('profileType') or request.GET.get('profile_type')
        profiles = ComplianceProfile.objects.filter(user_id=user_id)
        if jurisdiction_code:
            profiles = profiles.filter(jurisdiction_code=jurisdiction_code.upper()[:10])
        if profile_type:
            profiles = profiles.filter(profile_type=profile_type.lower()[:30])
        profiles = profiles.order_by('-updated_at')[:50]
        return JsonResponse({'success': True, 'profiles': [profile.to_dict() for profile in profiles]})

    data = parse_json(request)
    payload = _profile_payload(data)
    profile = ComplianceProfile(
        id=data.get('id') or str(uuid.uuid4()),
        user_id=user_id,
        **payload,
    )
    profile.save()
    return JsonResponse({'success': True, 'profile': profile.to_dict()}, status=201)


@jwt_required
def compliance_profile_detail(request, profile_id):
    user_id = request.righand_user_id
    profile = ComplianceProfile.objects.filter(pk=profile_id, user_id=user_id).first()
    if not profile:
        return JsonResponse({'error': 'Compliance profile not found'}, status=404)

    if request.method == 'GET':
        return JsonResponse({'success': True, 'profile': profile.to_dict()})

    if request.method == 'PUT':
        _apply_profile_fields(profile, parse_json(request))
        profile.save()
        return JsonResponse({'success': True, 'profile': profile.to_dict()})

    if request.method == 'DELETE':
        profile.delete()
        return JsonResponse({'success': True})

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@jwt_required
@require_http_methods(['GET', 'POST'])
def compliance_documents(request):
    user_id = request.righand_user_id

    if request.method == 'GET':
        jurisdiction_code = request.GET.get('jurisdictionCode') or request.GET.get('jurisdiction_code')
        documents = ComplianceDocument.objects.filter(user_id=user_id)
        if jurisdiction_code:
            documents = documents.filter(jurisdiction_code=jurisdiction_code.upper()[:10])
        documents = documents.order_by('-created_at')[:50]
        return JsonResponse({
            'success': True,
            'documents': [_document_with_findings(document) for document in documents],
        })

    if request.FILES.get('file'):
        file_obj = request.FILES['file']
        data = request.POST.copy()
        data['fileName'] = data.get('fileName') or file_obj.name
        data['mimeType'] = data.get('mimeType') or file_obj.content_type or ''
        text, extraction_method, summary = _extract_upload_text(file_obj)
        status = 'analyzed' if text else extraction_method
        document = _create_document(user_id, data, text=text, summary=summary, status=status)
        document['extractionMethod'] = extraction_method
    else:
        data = parse_json(request)
        document = _create_document(user_id, data)

    return JsonResponse({
        'success': True,
        'document': document,
    }, status=201)


@jwt_required
def compliance_document_detail(request, document_id):
    user_id = request.righand_user_id
    document = ComplianceDocument.objects.filter(pk=document_id, user_id=user_id).first()
    if not document:
        return JsonResponse({'error': 'Compliance document not found'}, status=404)

    if request.method == 'GET':
        return JsonResponse({'success': True, 'document': _document_with_findings(document)})

    if request.method == 'DELETE':
        ComplianceFinding.objects.filter(document_id=document.id, user_id=user_id).delete()
        document.delete()
        return JsonResponse({'success': True})

    return JsonResponse({'error': 'Method not allowed'}, status=405)
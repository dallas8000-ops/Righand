REVIEWED_AT = '2026-08-19'

VEHICLE_REGISTRATION = 'Vehicle registration'
DRIVER_LICENCE = 'Driver licence'
CARGO_MANIFEST = 'Cargo manifest'
SEAL_NUMBER = 'Seal number'
COMESA_INSURANCE = 'COMESA Yellow Card or cross-border insurance evidence'
AXLE_LOAD_REFERENCE = 'Current axle-load limits (from the official source)'
YELLOW_CARD_KEYWORD = 'yellow card'


COMPLIANCE_RULES = {
    'UG': {
        'label': 'Uganda',
        'rules': [
            {
                'id': 'ug-vehicle-load-control-2026',
                'title': '2026 vehicle dimensions and load-control regulations',
                'severity': 'critical',
                'summary': 'Before every trip, check your axle load, total weight and size at the weighbridge. Keep the weighbridge ticket, any overload notice and your special-load permit with you. Always confirm the exact weight limits with the ministry.',
                'requiredDocs': [VEHICLE_REGISTRATION, 'Motor vehicle inspection', 'Weighbridge ticket', AXLE_LOAD_REFERENCE, 'Special-load permit if needed', 'Reply to overload notice if you received one'],
                'keywords': ['axle', 'weighbridge', 'overload', 'gross', 'weight', 'dimension', 'special load', 'permit', 'gvm', 'vehicle load'],
            },
            {
                'id': 'ug-psv-driver-monitoring-2026',
                'title': 'PSV electronic clock-in and fatigue monitoring response',
                'severity': 'critical',
                'summary': 'Check clock-in, driving-hours visibility, rest-period monitoring, speed accountability, and driver verification records.',
                'requiredDocs': [DRIVER_LICENCE, 'Driver accreditation', 'Clock-in or trip sheet', 'Rest-period record', 'Medical exam record', 'Speed or incident report when applicable'],
                'keywords': ['psv', 'bus', 'clock', 'fatigue', 'rest', 'speed', 'driver hours', 'medical', 'accredited', 'school bus'],
            },
            {
                'id': 'ug-customs-transit',
                'title': 'URA and EAC customs transit readiness',
                'severity': 'warning',
                'summary': 'Keep customs entries, manifests, transit or bond references, COMESA Yellow Card or current insurance evidence, seal numbers, and border dates with the load packet.',
                'requiredDocs': ['URA customs entry', CARGO_MANIFEST, 'Transit or bond reference', COMESA_INSURANCE, SEAL_NUMBER, 'Border crossing record'],
                'keywords': ['ura', 'customs', 'manifest', 'seal', 'bond', 'transit', 'border', 'import', 'export', 'comesa', YELLOW_CARD_KEYWORD, 'insurance'],
            },
        ],
    },
    'KE': {
        'label': 'Kenya',
        'rules': [
            {
                'id': 'ke-ntsa-operator-driver',
                'title': 'NTSA operator, driver, and inspection records',
                'severity': 'critical',
                'summary': 'Keep your driving licence class and expiry date, vehicle inspection status, insurance, registration and operator licence ready.',
                'requiredDocs': [DRIVER_LICENCE, VEHICLE_REGISTRATION, 'Inspection record', 'Insurance record', 'Operator licence if needed'],
                'keywords': ['ntsa', 'driver licence', 'driving licence', 'inspection', 'insurance', 'registration', 'operator', 'road service'],
            },
            {
                'id': 'ke-axle-weighbridge',
                'title': 'Axle-load, weighbridge, and abnormal-load checks',
                'severity': 'critical',
                'summary': 'Keep your weighbridge tickets, axle-load records, overload notices and any permit for oversize loads. Always confirm the current weight limits with the official source.',
                'requiredDocs': ['Weighbridge ticket', 'Axle-load record', AXLE_LOAD_REFERENCE, 'Reply to overload notice', 'Permit for oversize or abnormal load if needed'],
                'keywords': ['axle', 'weighbridge', 'overload', 'gross weight', 'abnormal load', 'kenha', 'weight'],
            },
            {
                'id': 'ke-kra-customs',
                'title': 'KRA customs and iCMS cargo records',
                'severity': 'warning',
                'summary': 'Capture KRA/iCMS entries, declarations, manifests, bond references, COMESA Yellow Card or current insurance evidence, seal numbers, and border dates.',
                'requiredDocs': ['KRA or iCMS entry', CARGO_MANIFEST, 'Bond reference', COMESA_INSURANCE, SEAL_NUMBER, 'PIN or TCC reference when relevant'],
                'keywords': ['kra', 'icms', 'customs', 'pin', 'tcc', 'bond', 'seal', 'manifest', 'advance cargo', 'import', 'export', 'comesa', YELLOW_CARD_KEYWORD, 'insurance'],
            },
        ],
    },
    'RW': {
        'label': 'Rwanda',
        'rules': [
            {
                'id': 'rw-driver-vehicle-operator',
                'title': 'Driver, vehicle, roadworthiness, and authorisation records',
                'severity': 'critical',
                'summary': 'Track driver licence, vehicle registration, inspection or roadworthiness, authorisation, insurance, and safety notices.',
                'requiredDocs': [DRIVER_LICENCE, VEHICLE_REGISTRATION, 'Inspection or roadworthiness record', 'Insurance record', 'Transport authorisation when applicable'],
                'keywords': ['driver licence', 'registration', 'inspection', 'roadworthiness', 'rura', 'rtda', 'authorisation', 'authorization', 'insurance'],
            },
            {
                'id': 'rw-rra-customs-transit',
                'title': 'RRA customs, Electronic Single Window, and transit records',
                'severity': 'warning',
                'summary': 'Capture RRA entries, Electronic Single Window references, tax clearance, cargo forms, COMESA Yellow Card or current insurance evidence, seal numbers, and border dates.',
                'requiredDocs': ['RRA customs entry', 'Electronic Single Window reference', 'Transit declaration', COMESA_INSURANCE, SEAL_NUMBER, 'Trade Portal procedure documents'],
                'keywords': ['rra', 'single window', 'customs', 'transit', 'seal', 'tax clearance', 'trade portal', 'import', 'export', 'comesa', YELLOW_CARD_KEYWORD, 'insurance'],
            },
        ],
    },
    'EAC': {
        'label': 'EAC Cross-Border',
        'rules': [
            {
                'id': 'eac-customs-union',
                'title': 'EAC customs documentation and border records',
                'severity': 'critical',
                'summary': 'Keep declarations, bonds, manifests, COMESA Yellow Card or current insurance evidence, seal numbers, and border dates together for cross-border loads.',
                'requiredDocs': ['Customs declaration', CARGO_MANIFEST, 'Bond reference', COMESA_INSURANCE, SEAL_NUMBER, 'Border crossing record'],
                'keywords': ['eac', 'customs', 'bond', 'manifest', 'seal', 'border', 'declaration', 'single customs territory', 'comesa', YELLOW_CARD_KEYWORD, 'insurance'],
            },
            {
                'id': 'eac-corridor-load-control',
                'title': 'Cross-border route, commodity, and load-control prompts',
                'severity': 'warning',
                'summary': 'Write down the countries you pass through and the border posts, check whether your goods need a permit, and keep weighbridge tickets, the axle-load limits for each country and any special-load permits.',
                'requiredDocs': ['Route countries', 'Border posts', 'Commodity permits when required', 'Weighbridge tickets', AXLE_LOAD_REFERENCE, 'Special-load permits when required'],
                'keywords': ['route', 'transit country', 'commodity', 'permit', 'weighbridge', 'axle', 'special load', 'border post'],
            },
        ],
    },
    'EU': {
        'label': 'European Union',
        'rules': [
            {
                'id': 'eu-driving-rest-working-time',
                'title': 'Driving time, rest periods, and working time',
                'severity': 'critical',
                'summary': 'Track driving limits, breaks, rest, fortnightly totals, working time, and night-work limits.',
                'requiredDocs': ['Duty record', 'Rest record', 'Working-time summary', 'Night-work record when applicable'],
                'keywords': ['driving time', 'rest', 'break', 'weekly', 'fortnightly', 'working time', 'night work', 'availability', '561/2006', '2002/15'],
            },
            {
                'id': 'eu-tachograph-driver-card',
                'title': 'Tachograph files, driver cards, and manual entries',
                'severity': 'critical',
                'summary': 'Track tachograph downloads, driver cards, manual entries, missing days, calibration, and smart tachograph obligations.',
                'requiredDocs': ['Tachograph download', 'Driver card record', 'Manual entry notes', 'Calibration or inspection evidence'],
                'keywords': ['tachograph', 'driver card', 'manual entry', 'calibration', 'download', 'smart tachograph', '165/2014'],
            },
            {
                'id': 'eu-mobility-cabotage-posting',
                'title': 'Mobility Package, cabotage, and posting declarations',
                'severity': 'warning',
                'summary': 'Track international carriage evidence, cabotage operation counts/dates, cooling-off windows, and posting declarations.',
                'requiredDocs': ['Community licence', 'International carriage evidence', 'Cabotage operation records', 'Posting declaration when required'],
                'keywords': ['cabotage', 'posting', 'community licence', 'international carriage', 'cooling off', 'imi', 'mobility package', '1072/2009'],
            },
        ],
    },
}


def get_jurisdiction(code):
    normalized = (code or 'UG').upper()[:10]
    return normalized if normalized in COMPLIANCE_RULES else 'UG', COMPLIANCE_RULES.get(normalized, COMPLIANCE_RULES['UG'])


def analyze_compliance_text(jurisdiction_code, file_name='', mime_type='', text=''):
    code, jurisdiction = get_jurisdiction(jurisdiction_code)
    haystack = f'{file_name} {mime_type} {text}'.lower()
    matches = []
    for rule in jurisdiction['rules']:
        hits = [keyword for keyword in rule['keywords'] if keyword.lower() in haystack]
        if hits:
            matches.append({**rule, 'hits': hits})
    matches.sort(key=lambda rule: (-len(rule['hits']), rule['title']))
    selected_rules = matches or [{**rule, 'hits': []} for rule in jurisdiction['rules'][:3]]
    missing_docs = []
    for rule in selected_rules:
        for document in rule['requiredDocs']:
            if document not in missing_docs:
                missing_docs.append(document)
    return {
        'jurisdictionCode': code,
        'jurisdictionLabel': jurisdiction['label'],
        'directHit': bool(matches),
        'matches': selected_rules,
        'missingDocs': missing_docs[:8],
        'reviewedAt': REVIEWED_AT,
    }
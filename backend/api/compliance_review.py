from datetime import date, datetime, timedelta


DATE_FORMATS = ('%Y-%m-%d', '%Y/%m/%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y', '%B %d %Y', '%B %d, %Y')


def _parse_date(value):
    normalized = str(value).strip()
    for date_format in DATE_FORMATS:
        try:
            return datetime.strptime(normalized, date_format).date()
        except ValueError:
            continue
    return None


def build_review_alerts(extracted_fields, today=None):
    current_date = today or date.today()
    alerts = []
    for value in extracted_fields.get('dates', []):
        parsed = _parse_date(value)
        if not parsed:
            continue
        days_until = (parsed - current_date).days
        if days_until < 0:
            alerts.append({
                'level': 'critical',
                'title': 'Date appears expired',
                'body': f'{value} is {abs(days_until)} days in the past. Verify before dispatch.',
            })
        elif days_until <= 30:
            alerts.append({
                'level': 'warning',
                'title': 'Date is nearing expiry',
                'body': f'{value} is due in {days_until} days. Confirm the document is still valid.',
            })
    if extracted_fields.get('weights') and not extracted_fields.get('vehiclePlates'):
        alerts.append({
            'level': 'warning',
            'title': 'Weight found without vehicle ID',
            'body': 'Link the weight or weighbridge record to a vehicle plate before using it for dispatch readiness.',
        })
    return alerts[:5]
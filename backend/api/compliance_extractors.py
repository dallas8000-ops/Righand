import re


DATE_PATTERN = re.compile(r'\b\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b')
MONTH_DATE_PATTERN = re.compile(r'\b[A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}\b')
TOKEN_PATTERN = re.compile(r'\b[A-Z0-9][A-Z0-9/-]{3,24}\b', re.IGNORECASE)
WEIGHT_PATTERN = re.compile(r'\b\d{2,6}(?:\.\d+)?\s?(?:kg|kgs|tonnes|tons|gvm|gvw)\b', re.IGNORECASE)
NAME_PATTERN = re.compile(r'\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b')
PLACE_PATTERN = re.compile(r'\b[A-Z][A-Za-z-]{2,40}(?:\s[A-Z][A-Za-z-]{2,40}){0,3}\b')

LABELS = {
    'permitIds': ('permit', 'licence', 'license', 'prn', 'reference', 'entry', 'declaration', 'bond'),
    'vehiclePlates': ('plate', 'registration', 'reg.', 'vehicle'),
    'sealNumbers': ('seal',),
    'driverNames': ('driver', 'operator'),
    'borderPosts': ('border', 'entry point', 'exit point'),
}


def _unique(values, limit=10):
    seen = []
    for value in values:
        cleaned = ' '.join(str(value).strip(' :#,.').split())
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
        if len(seen) >= limit:
            break
    return seen


def _line_values(text, labels, value_pattern=TOKEN_PATTERN):
    values = []
    for line in (text or '').splitlines():
        lowered = line.lower()
        matched_label = next((label for label in labels if label in lowered), None)
        if not matched_label:
            continue
        label_index = lowered.find(matched_label) + len(matched_label)
        segment = line[label_index:]
        if ':' in segment:
            segment = segment.split(':', 1)[1]
        segment = segment.replace('number', ' ').replace('no.', ' ').replace('no', ' ')
        values.extend(match.group(0) for match in value_pattern.finditer(segment))
    return _unique(values)


def extract_compliance_fields(text):
    haystack = text or ''
    fields = {}
    dates = _unique(DATE_PATTERN.findall(haystack) + MONTH_DATE_PATTERN.findall(haystack))
    weights = _unique(WEIGHT_PATTERN.findall(haystack))
    if dates:
        fields['dates'] = dates
    if weights:
        fields['weights'] = weights
    for name, labels in LABELS.items():
        pattern = TOKEN_PATTERN
        if name == 'driverNames':
            pattern = NAME_PATTERN
        if name == 'borderPosts':
            pattern = PLACE_PATTERN
        values = _line_values(haystack, labels, pattern)
        if values:
            fields[name] = values
    return fields

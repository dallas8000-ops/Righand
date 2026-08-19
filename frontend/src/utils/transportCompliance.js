const reviewedAt = '2026-08-19';

const source = (label, url) => ({ label, url });

export const COMPLIANCE_JURISDICTIONS = [
  {
    code: 'UG',
    label: 'Uganda',
    region: 'East Africa',
    regulator: 'Ministry of Works and Transport, Parliament of Uganda, URA, UNRA',
    portal: 'https://works.go.ug/category/policies-and-regulations/',
    summary: 'High-priority pack for Uganda road safety, load control, vehicle inspection, operator licensing, PSV driver monitoring, and EAC customs readiness.',
    workflowPrompts: ['Check vehicle inspection before dispatch', 'Attach weighbridge or special-load evidence', 'Verify driver licence, medical, and rest records', 'Store customs and seal details for border loads'],
    rules: [
      {
        id: 'ug-vehicle-load-control-2026',
        group: 'Vehicle and load control',
        title: '2026 vehicle dimensions and load-control regulations',
        severity: 'critical',
        summary: 'Uganda MoWT posted the Roads vehicle dimensions, vehicle load control, and enforcement regulations in July 2026. Treat axle load, gross mass, dimensions, weighbridge tickets, overload notices, and special-load permits as dispatch readiness items.',
        requiredDocs: ['Vehicle registration', 'Motor vehicle inspection', 'Weighbridge ticket', 'Special-load permit when applicable', 'Overload notice response when applicable'],
        keywords: ['axle', 'weighbridge', 'overload', 'gross', 'weight', 'dimension', 'special load', 'permit', 'gvm', 'vehicle load'],
        sources: [source('Uganda MoWT policies and regulations', 'https://works.go.ug/category/policies-and-regulations/'), source('MoWT special load permits', 'https://online.unra.go.ug/permits')]
      },
      {
        id: 'ug-psv-driver-monitoring-2026',
        group: 'Driver and PSV safety',
        title: 'PSV electronic clock-in and fatigue monitoring response',
        severity: 'critical',
        summary: 'After July 2026 crashes, Parliament reported MoWT proposals for electronic PSV driver clock-in, driving-hours visibility, rest-period monitoring, speed accountability, and digital verification of vehicles and drivers.',
        requiredDocs: ['Driver licence', 'Driver accreditation', 'Clock-in or trip sheet', 'Rest-period record', 'Medical exam record', 'Speed or incident report when applicable'],
        keywords: ['psv', 'bus', 'clock', 'fatigue', 'rest', 'speed', 'driver hours', 'medical', 'accredited', 'school bus'],
        sources: [source('Parliament PSV monitoring report', 'https://gateway.parliament.go.ug/news/4509/govt-moots-electronic-monitoring-system-psv-drivers')]
      },
      {
        id: 'ug-traffic-road-safety-2023-2026',
        group: 'Traffic and road safety',
        title: 'Traffic and Road Safety amendments and 2026 Bill watch',
        severity: 'warning',
        summary: 'Uganda MoWT lists road-safety amendments for safety belts, alcohol and drugs, post-crash care, goods-vehicle driver tests, digital networks, demerit points, and appeals. The 2026 Bill also needs review for vehicle-age import and levy rules.',
        requiredDocs: ['Safety-belt checklist', 'Driver testing record', 'Demerit or offence notice', 'Post-crash report when applicable', 'Vehicle age/import record when applicable'],
        keywords: ['safety belt', 'alcohol', 'drug', 'post crash', 'demerit', 'driving test', 'import', '13 years', 'environmental levy'],
        sources: [source('Uganda traffic and road safety laws', 'https://works.go.ug/category/policies-and-regulations/traffic-and-road-safety-laws-and-regulations/')]
      },
      {
        id: 'ug-customs-transit',
        group: 'Customs and cross-border',
        title: 'URA and EAC customs transit readiness',
        severity: 'warning',
        summary: 'Cross-border cargo should keep customs entries, manifests, transit or bond references, seal numbers, and border dates with the load packet.',
        requiredDocs: ['URA customs entry', 'Cargo manifest', 'Transit or bond reference', 'Seal number', 'Border crossing record'],
        keywords: ['ura', 'customs', 'manifest', 'seal', 'bond', 'transit', 'border', 'import', 'export'],
        sources: [source('Uganda Revenue Authority', 'https://www.ura.go.ug/'), source('EAC customs', 'https://www.eac.int/customs')]
      }
    ]
  },
  {
    code: 'KE',
    label: 'Kenya',
    region: 'East Africa',
    regulator: 'NTSA, KRA, Kenya road agencies',
    portal: 'https://www.ntsa.go.ke/',
    summary: 'Kenya pack for NTSA licensing, driver and vehicle compliance, inspection, axle-load control, and KRA cargo/customs records.',
    workflowPrompts: ['Confirm NTSA driver and vehicle documents', 'Attach inspection and insurance evidence', 'Capture weighbridge records', 'Store KRA customs references for border cargo'],
    rules: [
      {
        id: 'ke-ntsa-operator-driver',
        group: 'Operator and driver compliance',
        title: 'NTSA operator, driver, and inspection records',
        severity: 'critical',
        summary: 'Kenyan operators should keep driver licence class and expiry, operator or service credentials, inspection status, insurance, registration, and enforcement notices ready for review.',
        requiredDocs: ['Driver licence', 'Vehicle registration', 'Inspection record', 'Insurance record', 'Operator credential when applicable'],
        keywords: ['ntsa', 'driver licence', 'driving licence', 'inspection', 'insurance', 'registration', 'operator', 'road service'],
        sources: [source('NTSA', 'https://www.ntsa.go.ke/')]
      },
      {
        id: 'ke-axle-weighbridge',
        group: 'Vehicle and load compliance',
        title: 'Axle-load, weighbridge, and abnormal-load checks',
        severity: 'critical',
        summary: 'Kenya load compliance should track gross weight, axle-load records, weighbridge tickets, overload notices, penalties, and abnormal-load permits where required.',
        requiredDocs: ['Weighbridge ticket', 'Axle-load record', 'Overload notice response', 'Abnormal-load permit when applicable'],
        keywords: ['axle', 'weighbridge', 'overload', 'gross weight', 'abnormal load', 'kenha', 'weight'],
        sources: [source('Kenya National Highways Authority', 'https://kenha.co.ke/')]
      },
      {
        id: 'ke-kra-customs',
        group: 'Customs and cargo',
        title: 'KRA customs and iCMS cargo records',
        severity: 'warning',
        summary: 'Kenya cross-border and cargo operations should capture KRA/iCMS entries, declarations, manifests, bond references, seal numbers, border dates, PIN/TCC checks, and advance cargo references when applicable.',
        requiredDocs: ['KRA or iCMS entry', 'Cargo manifest', 'Bond reference', 'Seal number', 'PIN or TCC reference when relevant'],
        keywords: ['kra', 'icms', 'customs', 'pin', 'tcc', 'bond', 'seal', 'manifest', 'advance cargo', 'import', 'export'],
        sources: [source('KRA online services', 'https://www.kra.go.ke/our-online-services')]
      }
    ]
  },
  {
    code: 'RW',
    label: 'Rwanda',
    region: 'East Africa',
    regulator: 'RRA, Rwanda Trade Portal, RURA, RTDA, Rwanda National Police',
    portal: 'https://rwandatrade.rw/',
    summary: 'Rwanda pack for driver and vehicle records, transport service authorisation, RRA customs, Electronic Single Window, motor vehicle levy, and transit procedure readiness.',
    workflowPrompts: ['Check vehicle and driver records', 'Attach RRA customs or Single Window references', 'Confirm trade-portal procedure documents', 'Track motor vehicle levy and clearance records where relevant'],
    rules: [
      {
        id: 'rw-driver-vehicle-operator',
        group: 'Driver, vehicle, and operator compliance',
        title: 'Driver, vehicle, roadworthiness, and authorisation records',
        severity: 'critical',
        summary: 'Rwanda operations should track driver licence, vehicle registration, inspection or roadworthiness, transport service authorisation, insurance, and road-safety notices.',
        requiredDocs: ['Driver licence', 'Vehicle registration', 'Inspection or roadworthiness record', 'Insurance record', 'Transport authorisation when applicable'],
        keywords: ['driver licence', 'registration', 'inspection', 'roadworthiness', 'rura', 'rtda', 'authorisation', 'authorization', 'insurance'],
        sources: [source('Rwanda Trade Portal', 'https://rwandatrade.rw/'), source('Rwanda Revenue Authority', 'https://www.rra.gov.rw/en/home')]
      },
      {
        id: 'rw-rra-customs-transit',
        group: 'Customs and transit',
        title: 'RRA customs, Electronic Single Window, and transit records',
        severity: 'warning',
        summary: 'Rwanda import, export, and transit work should capture RRA entries, Electronic Single Window references, tax clearance, cargo forms, seal numbers, border dates, and procedure-specific documents from the Trade Portal.',
        requiredDocs: ['RRA customs entry', 'Electronic Single Window reference', 'Transit declaration', 'Seal number', 'Trade Portal procedure documents'],
        keywords: ['rra', 'single window', 'customs', 'transit', 'seal', 'tax clearance', 'trade portal', 'import', 'export'],
        sources: [source('RRA', 'https://www.rra.gov.rw/en/home'), source('Rwanda Trade Portal procedures', 'https://rwandatrade.rw/Products?l=en')]
      },
      {
        id: 'rw-motor-vehicle-levy',
        group: 'Vehicle and tax compliance',
        title: 'Motor vehicle levy and clearance readiness',
        severity: 'info',
        summary: 'RRA lists motor vehicle levy for road maintenance and tax clearance services. Where relevant, keep levy and clearance evidence with vehicle compliance records.',
        requiredDocs: ['Motor vehicle levy record', 'Tax clearance reference when relevant'],
        keywords: ['motor vehicle levy', 'road maintenance', 'tax clearance', 'quitus', 'tin', 'levy'],
        sources: [source('RRA services', 'https://www.rra.gov.rw/en/home')]
      }
    ]
  },
  {
    code: 'EAC',
    label: 'EAC Cross-Border',
    region: 'East Africa',
    regulator: 'East African Community and partner-state customs/road agencies',
    portal: 'https://www.eac.int/customs',
    summary: 'Cross-border overlay for EAC customs, border, cargo, bond, seal, axle-load, and special-load readiness across Uganda, Kenya, Rwanda, and partner states.',
    workflowPrompts: ['Record origin, destination, and transit countries', 'Attach declaration, bond, manifest, and seal details', 'Check commodity permits', 'Keep axle/load evidence across corridors'],
    rules: [
      {
        id: 'eac-customs-union',
        group: 'Customs union readiness',
        title: 'EAC customs documentation and border records',
        severity: 'critical',
        summary: 'EAC customs cooperation covers harmonised documentation, customs regulations, and procedures. Cross-border loads should keep declarations, bonds, manifests, seal numbers, and border dates together.',
        requiredDocs: ['Customs declaration', 'Cargo manifest', 'Bond reference', 'Seal number', 'Border crossing record'],
        keywords: ['eac', 'customs', 'bond', 'manifest', 'seal', 'border', 'declaration', 'single customs territory'],
        sources: [source('EAC customs', 'https://www.eac.int/customs')]
      },
      {
        id: 'eac-corridor-load-control',
        group: 'Route and load readiness',
        title: 'Cross-border route, commodity, and load-control prompts',
        severity: 'warning',
        summary: 'Cross-border routes should identify transit countries, border posts, commodity permit needs, weighbridge records, axle-load checks, and special-load permits per country.',
        requiredDocs: ['Route countries', 'Border posts', 'Commodity permits when required', 'Weighbridge tickets', 'Special-load permits when required'],
        keywords: ['route', 'transit country', 'commodity', 'permit', 'weighbridge', 'axle', 'special load', 'border post'],
        sources: [source('EAC customs tools', 'https://www.eac.int/customs')]
      }
    ]
  },
  {
    code: 'EU',
    label: 'European Union',
    region: 'EU region',
    regulator: 'European Commission, Member State enforcement authorities, UNECE ADR',
    portal: 'https://transport.ec.europa.eu/transport-modes/road_en',
    summary: 'EU pack for driving time, rest, mobile working time, tachographs, weights and dimensions, Mobility Package, posting, cabotage, and ADR dangerous goods.',
    workflowPrompts: ['Check driving and rest clocks', 'Attach tachograph and driver card evidence', 'Track cabotage and posting windows', 'Confirm weights, dimensions, and ADR documents'],
    rules: [
      {
        id: 'eu-driving-rest-working-time',
        group: 'Driver time and working time',
        title: 'Driving time, rest periods, and working time',
        severity: 'critical',
        summary: 'EU rules track daily and weekly driving limits, 45-minute breaks after 4.5 hours, daily and weekly rest, fortnightly totals, 48-hour average working week, possible 60-hour week condition, and night-work limits.',
        requiredDocs: ['Duty record', 'Rest record', 'Working-time summary', 'Night-work record when applicable'],
        keywords: ['driving time', 'rest', 'break', 'weekly', 'fortnightly', 'working time', 'night work', 'availability', '561/2006', '2002/15'],
        sources: [source('EU driving time and rest', 'https://transport.ec.europa.eu/transport-modes/road/social-provisions/driving-time-and-rest-periods_en'), source('EU working time', 'https://transport.ec.europa.eu/transport-modes/road/social-provisions/working-time_en')]
      },
      {
        id: 'eu-tachograph-driver-card',
        group: 'Tachograph and driver card',
        title: 'Tachograph files, driver cards, and manual entries',
        severity: 'critical',
        summary: 'Regulation 165/2014 requires tachograph records for covered vehicles. Track downloads, driver cards, manual entries, missing days, calibration, and smart tachograph obligations.',
        requiredDocs: ['Tachograph download', 'Driver card record', 'Manual entry notes', 'Calibration or inspection evidence'],
        keywords: ['tachograph', 'driver card', 'manual entry', 'calibration', 'download', 'smart tachograph', '165/2014'],
        sources: [source('EU tachograph', 'https://transport.ec.europa.eu/transport-modes/road/tachograph_en')]
      },
      {
        id: 'eu-mobility-cabotage-posting',
        group: 'Market access and posting',
        title: 'Mobility Package, cabotage, and posting declarations',
        severity: 'warning',
        summary: 'EU market rules require evidence of international carriage, cabotage operation counts and dates, 7-day and 4-day cooling-off windows, community licence records, and posting declarations through the EU portal/IMI interface where required.',
        requiredDocs: ['Community licence', 'International carriage evidence', 'Cabotage operation records', 'Posting declaration when required'],
        keywords: ['cabotage', 'posting', 'community licence', 'international carriage', 'cooling off', 'imi', 'mobility package', '1072/2009'],
        sources: [source('EU cabotage guidance', 'https://transport.ec.europa.eu/transport-modes/road/mobility-package-i/market-rules/rules-cabotage-applicable-21-february-2022_en'), source('EU posting rules', 'https://transport.ec.europa.eu/transport-modes/road/mobility-package-i/posting-rules_en')]
      },
      {
        id: 'eu-weights-adr',
        group: 'Vehicle, load, and dangerous goods',
        title: 'Weights, dimensions, and ADR dangerous goods',
        severity: 'warning',
        summary: 'EU fleets should track weights and dimensions under Directive 96/53/EC and ADR documents for dangerous goods, including UN number, hazard class, ADR driver certificate, placards, and safety equipment.',
        requiredDocs: ['Weight and dimension record', 'Oversize permit when applicable', 'ADR transport document when applicable', 'ADR driver certificate when applicable'],
        keywords: ['weight', 'dimension', '96/53', 'adr', 'dangerous goods', 'un number', 'hazard', 'placard', 'certificate'],
        sources: [source('EU weights and dimensions', 'https://transport.ec.europa.eu/transport-modes/road/weights-and-dimensions_en'), source('UNECE ADR', 'https://unece.org/transport/dangerous-goods/adr')]
      }
    ]
  }
];

export const getComplianceJurisdiction = (code) => (
  COMPLIANCE_JURISDICTIONS.find(jurisdiction => jurisdiction.code === code) || COMPLIANCE_JURISDICTIONS[0]
);

const normalize = (value) => String(value || '').toLowerCase();

const keywordHits = (haystack, keywords) => keywords.filter(keyword => haystack.includes(normalize(keyword)));

export const analyzeComplianceUpload = ({ jurisdictionCode, fileName, mimeType, text }) => {
  const jurisdiction = getComplianceJurisdiction(jurisdictionCode);
  const haystack = normalize(`${fileName || ''} ${mimeType || ''} ${text || ''}`);
  const matches = jurisdiction.rules
    .map(rule => ({ ...rule, hits: keywordHits(haystack, rule.keywords) }))
    .filter(rule => rule.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length || a.title.localeCompare(b.title));

  const fallback = jurisdiction.rules.slice(0, 3).map(rule => ({ ...rule, hits: [] }));
  const selectedRules = matches.length ? matches : fallback;
  const missingDocs = Array.from(new Set(selectedRules.flatMap(rule => rule.requiredDocs))).slice(0, 8);

  return {
    id: `scan-${Date.now()}`,
    fileName: fileName || 'Uploaded document',
    mimeType: mimeType || 'unknown',
    jurisdictionCode: jurisdiction.code,
    jurisdictionLabel: jurisdiction.label,
    directHit: matches.length > 0,
    matches: selectedRules,
    missingDocs,
    reviewedAt,
    createdAt: new Date().toISOString()
  };
};

export const readComplianceFileText = (file) => new Promise((resolve) => {
  if (!file || (!file.type?.startsWith('text/') && !/\.(txt|md|csv|json)$/i.test(file?.name || ''))) {
    resolve('');
    return;
  }
  file.text().then(resolve).catch(() => resolve(''));
});
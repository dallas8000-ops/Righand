const reviewedAt = '2026-08-19';

const source = (label, url) => ({ label, url });

export const COMPLIANCE_JURISDICTIONS = [
  {
    code: 'UG',
    label: 'Uganda',
    region: 'East Africa',
    regulator: 'Ministry of Works and Transport, Parliament of Uganda, URA, UNRA',
    portal: 'https://works.go.ug/category/policies-and-regulations/',
    summary: 'Uganda checklist for road safety, load limits, vehicle inspection, operator licensing, bus (PSV) driver monitoring, cross-border papers and customs.',
    workflowPrompts: ['Check your vehicle inspection before you leave', 'Keep your weighbridge ticket, the current axle-load limits and any special-load permit with you', 'Check your driving licence, medical and rest records', 'Keep customs papers, COMESA Yellow Card and seal numbers for border loads'],
    rules: [
      {
        id: 'ug-vehicle-load-control-2026',
        group: 'Vehicle and load control',
        title: 'New vehicle size and load-limit rules (2026)',
        severity: 'critical',
        summary: 'In July 2026 the Ministry of Works and Transport published new rules on vehicle size, load limits and fines. Before every trip, check your axle load, total weight and size at the weighbridge. Keep the weighbridge ticket, any overload notice and your special-load permit with you. Always confirm the exact weight limits with the ministry.',
        requiredDocs: ['Vehicle registration', 'Motor vehicle inspection', 'Weighbridge ticket', 'Current axle-load limits (from the official source)', 'Special-load permit if needed', 'Reply to overload notice if you received one'],
        keywords: ['axle', 'weighbridge', 'overload', 'gross', 'weight', 'dimension', 'special load', 'permit', 'gvm', 'vehicle load'],
        sources: [source('Uganda MoWT policies and regulations', 'https://works.go.ug/category/policies-and-regulations/'), source('MoWT special load permits', 'https://online.unra.go.ug/permits')]
      },
      {
        id: 'ug-psv-driver-monitoring-2026',
        group: 'Driver and PSV safety',
        title: 'Electronic clock-in and tiredness checks for bus (PSV) drivers',
        severity: 'critical',
        summary: 'After crashes in July 2026, the Ministry of Works and Transport proposed electronic clock-in for bus and passenger-vehicle drivers, with checks on driving hours, rest time and speed, and digital checks of drivers and vehicles. Keep your clock-in or trip sheet and rest records ready.',
        requiredDocs: ['Driver licence', 'Driver accreditation', 'Clock-in or trip sheet', 'Rest-period record', 'Medical exam record', 'Speed or incident report if there was one'],
        keywords: ['psv', 'bus', 'clock', 'fatigue', 'rest', 'speed', 'driver hours', 'medical', 'accredited', 'school bus'],
        sources: [source('Parliament PSV monitoring report', 'https://gateway.parliament.go.ug/news/4509/govt-moots-electronic-monitoring-system-psv-drivers')]
      },
      {
        id: 'ug-traffic-road-safety-2023-2026',
        group: 'Traffic and road safety',
        title: 'Traffic and road safety law changes (2026 Bill)',
        severity: 'warning',
        summary: 'The Ministry of Works and Transport lists changes to road-safety law: seat belts, alcohol and drugs, care after a crash, driver tests for goods vehicles, demerit points and appeals. The 2026 Bill may also change the rules on importing older vehicles and on levies. Keep checking for updates.',
        requiredDocs: ['Seat-belt checklist', 'Driver test record', 'Demerit or offence notice', 'Post-crash report if there was a crash', 'Vehicle age and import record if needed'],
        keywords: ['safety belt', 'alcohol', 'drug', 'post crash', 'demerit', 'driving test', 'import', '13 years', 'environmental levy'],
        sources: [source('Uganda traffic and road safety laws', 'https://works.go.ug/category/policies-and-regulations/traffic-and-road-safety-laws-and-regulations/')]
      },
      {
        id: 'ug-customs-transit',
        group: 'Customs and cross-border',
        title: 'Customs papers for cross-border loads (URA and EAC)',
        severity: 'warning',
        summary: 'For cross-border cargo, keep these with the trip file: customs entries, cargo manifest, transit or bond reference, COMESA Yellow Card (or other valid cross-border insurance), seal numbers and the dates you crossed the border.',
        requiredDocs: ['URA customs entry', 'Cargo manifest', 'Transit or bond reference', 'COMESA Yellow Card or cross-border insurance evidence', 'Seal number', 'Border crossing record'],
        keywords: ['ura', 'customs', 'manifest', 'seal', 'bond', 'transit', 'border', 'import', 'export', 'comesa', 'yellow card', 'insurance'],
        sources: [source('Uganda Revenue Authority', 'https://www.ura.go.ug/'), source('EAC customs', 'https://www.eac.int/customs'), source('COMESA Yellow Card Scheme', 'https://ycmis.comesa.int/')]
      }
    ]
  },
  {
    code: 'KE',
    label: 'Kenya',
    region: 'East Africa',
    regulator: 'NTSA, KRA, Kenya road agencies',
    portal: 'https://www.ntsa.go.ke/',
    summary: 'Kenya checklist for NTSA licensing, driver and vehicle papers, inspection, axle-load records, cross-border insurance and KRA customs records.',
    workflowPrompts: ['Confirm your NTSA driver and vehicle documents', 'Keep inspection and insurance papers with you', 'Keep weighbridge records and the current axle-load limits', 'Keep KRA customs papers and COMESA Yellow Card details for border cargo'],
    rules: [
      {
        id: 'ke-ntsa-operator-driver',
        group: 'Operator and driver compliance',
        title: 'NTSA papers: operator, driver and inspection',
        severity: 'critical',
        summary: 'Keep these ready for checks: your driving licence class and expiry date, operator or service licence, vehicle inspection status, insurance, registration and any notices from enforcement officers.',
        requiredDocs: ['Driver licence', 'Vehicle registration', 'Inspection record', 'Insurance record', 'Operator licence if needed'],
        keywords: ['ntsa', 'driver licence', 'driving licence', 'inspection', 'insurance', 'registration', 'operator', 'road service'],
        sources: [source('NTSA', 'https://www.ntsa.go.ke/')]
      },
      {
        id: 'ke-axle-weighbridge',
        group: 'Vehicle and load compliance',
        title: 'Axle load, weighbridge and oversize-load checks',
        severity: 'critical',
        summary: 'Keep your weighbridge tickets, axle-load records and any overload notices or fines. Get a permit for oversize or abnormal loads where one is needed. Always confirm the current weight limits with the official source.',
        requiredDocs: ['Weighbridge ticket', 'Axle-load record', 'Current axle-load limits (from the official source)', 'Reply to overload notice', 'Permit for oversize or abnormal load if needed'],
        keywords: ['axle', 'weighbridge', 'overload', 'gross weight', 'abnormal load', 'kenha', 'weight'],
        sources: [source('Kenya National Highways Authority', 'https://kenha.co.ke/')]
      },
      {
        id: 'ke-kra-customs',
        group: 'Customs and cargo',
        title: 'KRA customs papers for cargo (iCMS)',
        severity: 'warning',
        summary: 'For cross-border and customs cargo, keep your KRA/iCMS entries, declarations, manifest, bond reference, COMESA Yellow Card (or other valid cross-border insurance), seal numbers and border dates. Check your PIN and tax compliance certificate (TCC) where needed.',
        requiredDocs: ['KRA or iCMS entry', 'Cargo manifest', 'Bond reference', 'COMESA Yellow Card or cross-border insurance evidence', 'Seal number', 'PIN or TCC reference if needed'],
        keywords: ['kra', 'icms', 'customs', 'pin', 'tcc', 'bond', 'seal', 'manifest', 'advance cargo', 'import', 'export', 'comesa', 'yellow card', 'insurance'],
        sources: [source('KRA online services', 'https://www.kra.go.ke/our-online-services'), source('COMESA Yellow Card Scheme', 'https://ycmis.comesa.int/')]
      }
    ]
  },
  {
    code: 'RW',
    label: 'Rwanda',
    region: 'East Africa',
    regulator: 'RRA, Rwanda Trade Portal, RURA, RTDA, Rwanda National Police',
    portal: 'https://rwandatrade.rw/',
    summary: 'Rwanda checklist for driver and vehicle papers, transport authorisation, RRA customs, the Electronic Single Window, motor vehicle levy, cross-border insurance and transit papers.',
    workflowPrompts: ['Check your vehicle and driver records', 'Keep RRA customs or Single Window references', 'Confirm the papers for the Trade Portal procedure', 'Keep motor vehicle levy, COMESA Yellow Card and clearance records'],
    rules: [
      {
        id: 'rw-driver-vehicle-operator',
        group: 'Driver, vehicle, and operator compliance',
        title: 'Driver, vehicle, roadworthiness, and authorisation records',
        severity: 'critical',
        summary: 'Keep your driving licence, vehicle registration, inspection or roadworthiness record, transport authorisation, insurance and any road-safety notices.',
        requiredDocs: ['Driver licence', 'Vehicle registration', 'Inspection or roadworthiness record', 'Insurance record', 'Transport authorisation when applicable'],
        keywords: ['driver licence', 'registration', 'inspection', 'roadworthiness', 'rura', 'rtda', 'authorisation', 'authorization', 'insurance'],
        sources: [source('Rwanda Trade Portal', 'https://rwandatrade.rw/'), source('Rwanda Revenue Authority', 'https://www.rra.gov.rw/en/home')]
      },
      {
        id: 'rw-rra-customs-transit',
        group: 'Customs and transit',
        title: 'RRA customs, Electronic Single Window, and transit records',
        severity: 'warning',
        summary: 'For import, export and transit loads, keep RRA entries, Electronic Single Window references, tax clearance, cargo forms, COMESA Yellow Card (or other valid cross-border insurance), seal numbers, border dates and the papers listed for your procedure on the Trade Portal.',
        requiredDocs: ['RRA customs entry', 'Electronic Single Window reference', 'Transit declaration', 'COMESA Yellow Card or cross-border insurance evidence', 'Seal number', 'Trade Portal procedure documents'],
        keywords: ['rra', 'single window', 'customs', 'transit', 'seal', 'tax clearance', 'trade portal', 'import', 'export', 'comesa', 'yellow card', 'insurance'],
        sources: [source('RRA', 'https://www.rra.gov.rw/en/home'), source('Rwanda Trade Portal procedures', 'https://rwandatrade.rw/Products?l=en'), source('COMESA Yellow Card Scheme', 'https://ycmis.comesa.int/')]
      },
      {
        id: 'rw-motor-vehicle-levy',
        group: 'Vehicle and tax compliance',
        title: 'Motor vehicle levy and tax clearance',
        severity: 'info',
        summary: 'RRA charges a motor vehicle levy for road maintenance and offers tax clearance services. If they apply to you, keep the levy and clearance papers with your vehicle records.',
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
    summary: 'Checklist for loads that cross borders in East Africa: customs papers, border records, cargo, bond, seal numbers, COMESA Yellow Card insurance, axle-load records and special-load permits across Uganda, Kenya, Rwanda and partner states.',
    workflowPrompts: ['Write down the origin, destination and every country you pass through', 'Keep the declaration, bond, manifest, COMESA Yellow Card and seal details', 'Check whether your goods need a permit', 'Keep axle-load records for each country on the route'],
    rules: [
      {
        id: 'eac-customs-union',
        group: 'Customs union readiness',
        title: 'EAC customs documentation and border records',
        severity: 'critical',
        summary: 'EAC countries work together on customs papers and procedures. For cross-border loads, keep the declaration, bond, manifest, COMESA Yellow Card (or other valid insurance), seal numbers and border dates together.',
        requiredDocs: ['Customs declaration', 'Cargo manifest', 'Bond reference', 'COMESA Yellow Card or cross-border insurance evidence', 'Seal number', 'Border crossing record'],
        keywords: ['eac', 'customs', 'bond', 'manifest', 'seal', 'border', 'declaration', 'single customs territory', 'comesa', 'yellow card', 'insurance'],
        sources: [source('EAC customs', 'https://www.eac.int/customs'), source('COMESA Yellow Card Scheme', 'https://ycmis.comesa.int/')]
      },
      {
        id: 'eac-corridor-load-control',
        group: 'Route and load readiness',
        title: 'Route, goods permits and load limits across borders',
        severity: 'warning',
        summary: 'For cross-border routes, write down the countries you pass through and the border posts, check whether your goods need a permit, and keep weighbridge tickets, the axle-load limits for each country and any special-load permits.',
        requiredDocs: ['Countries on the route', 'Border posts', 'Goods permits if needed', 'Weighbridge tickets', 'Current axle-load limits (from the official source)', 'Special-load permits if needed'],
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
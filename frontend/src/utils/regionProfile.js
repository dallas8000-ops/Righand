const EAC_FUEL_COUNTRIES = [
  { code: 'UG', name: 'Uganda' },
  { code: 'KE', name: 'Kenya' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'BI', name: 'Burundi' },
  { code: 'SS', name: 'South Sudan' },
  { code: 'CD', name: 'DR Congo' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'SO', name: 'Somalia' },
];

const METRIC_PROFILE = {
  fuelUnit: 'Litres',
  fuelUnitShort: 'L',
  distanceUnit: 'km',
  efficiencyUnit: 'km/L',
  fuelLocationLabel: 'Fuel Country (cross-border)',
  fuelLocationPlaceholder: 'Select country',
  fuelLocations: EAC_FUEL_COUNTRIES,
  fuelLogPlaceholder: 'Litres from pump receipt',
  fuelReportTitle: 'Cross-Border Fuel',
  fuelReportLocationHeader: 'Country',
  reportsTitle: 'Tax & Fuel Reports',
  taxReportTitle: 'Income & Expense Summary',
};

const REGION_PROFILES = {
  UG: METRIC_PROFILE,
  KE: METRIC_PROFILE,
  RW: METRIC_PROFILE,
  EU: METRIC_PROFILE,
  EAC: METRIC_PROFILE,
};

export const getRegionProfile = (jurisdictionCode) => (
  REGION_PROFILES[jurisdictionCode] || METRIC_PROFILE
);

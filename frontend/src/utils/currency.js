const JURISDICTION_CURRENCY = {
  UG: 'UGX',
  KE: 'KES',
  RW: 'RWF',
  EU: 'EUR',
  EAC: 'USD',
};

export const getCurrencyForJurisdiction = (jurisdictionCode) => (
  JURISDICTION_CURRENCY[jurisdictionCode] || 'USD'
);

export const formatCurrency = (value, currencyCode = 'USD', options = {}) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: 'code',
    ...options,
  }).format(Number(value));
};

export const makeMoneyFormatter = (currencyCode) => (
  (value, options) => formatCurrency(value, currencyCode, options)
);
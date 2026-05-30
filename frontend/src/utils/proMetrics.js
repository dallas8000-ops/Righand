export const EMPTY_FORM = {
  description: '',
  amount: '',
  category: 'fuel',
  type: 'expense',
  date: new Date().toISOString().split('T')[0],
  miles: '',
  gallons: '',
  odometer: '',
  deadheadMiles: '',
  tollsAmount: '',
  fuelCostAlloc: '',
  notes: '',
  receiptUrl: '',
  broker: '',
  customer: '',
  fuelState: ''
};

export const computeLocalMetrics = (expenses) => {
  const totalIncome = expenses
    .filter(e => e.type === 'income')
    .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const totalExpenses = expenses
    .filter(e => e.type === 'expense')
    .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const netProfit = totalIncome - totalExpenses;

  const loadedMiles = expenses
    .filter(e => e.type === 'income' && parseFloat(e.miles) > 0)
    .reduce((sum, e) => sum + parseFloat(e.miles), 0);
  const allMiles = expenses
    .filter(e => parseFloat(e.miles) > 0)
    .reduce((sum, e) => sum + parseFloat(e.miles), 0);
  const milesBasis = loadedMiles || allMiles;

  const fuelEntries = expenses.filter(e => e.category === 'fuel' && e.type === 'expense');
  const totalGallons = fuelEntries.reduce((sum, e) => sum + (parseFloat(e.gallons) || 0), 0);
  const totalFuelCost = fuelEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  return {
    totalIncome,
    totalExpenses,
    netProfit,
    loadedMiles,
    totalMiles: allMiles,
    profitPerMile: milesBasis ? netProfit / milesBasis : null,
    totalGallons,
    totalFuelCost,
    costPerGallon: totalGallons ? totalFuelCost / totalGallons : null,
    fuelCostPerMile: milesBasis ? totalFuelCost / milesBasis : null
  };
};

/** MPG from miles+gallons on same entry, or odometer delta vs previous fuel stop */
export const computeFuelMpg = (formData, previousOdometer) => {
  const gallons = parseFloat(formData.gallons);
  const miles = parseFloat(formData.miles);
  const odometer = parseFloat(formData.odometer);
  if (gallons > 0 && miles > 0) return miles / gallons;
  if (gallons > 0 && previousOdometer > 0 && odometer > previousOdometer) {
    return (odometer - previousOdometer) / gallons;
  }
  return null;
};

export const computeFuelCostPerMile = (formData, mpg) => {
  const amount = parseFloat(formData.amount);
  const miles = parseFloat(formData.miles);
  if (miles > 0 && amount > 0) return amount / miles;
  if (mpg > 0 && amount > 0) {
    const gallons = parseFloat(formData.gallons);
    if (gallons > 0) return amount / (gallons * mpg) * mpg;
  }
  return null;
};

export const findPreviousFuelOdometer = (expenses, beforeDate) => {
  const fuelStops = expenses
    .filter(e => e.category === 'fuel' && e.odometer)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  if (beforeDate) {
    const prior = fuelStops.filter(e => new Date(e.date) < new Date(beforeDate));
    return prior.length ? parseFloat(prior[0].odometer) : null;
  }
  return fuelStops.length ? parseFloat(fuelStops[0].odometer) : null;
};

export const computeWeeklyFromExpenses = (expenses) => {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(end);
    day.setDate(end.getDate() - i);
    const dayStr = day.toISOString().split('T')[0];
    const dayEntries = expenses.filter(e => (e.date || '').startsWith(dayStr));
    const income = dayEntries.filter(e => e.type === 'income').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const expenseTotal = dayEntries.filter(e => e.type === 'expense').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    days.push({
      date: dayStr,
      label: day.toLocaleDateString('en-US', { weekday: 'short' }),
      income,
      expenses: expenseTotal,
      net: income - expenseTotal,
      entryCount: dayEntries.length
    });
  }
  return days;
};

export const computeLoadProfitPreview = (formData) => {
  const rate = parseFloat(formData.amount) || 0;
  const fuel = parseFloat(formData.fuelCostAlloc) || 0;
  const tolls = parseFloat(formData.tollsAmount) || 0;
  const miles = parseFloat(formData.miles) || 0;
  const net = rate - fuel - tolls;
  return {
    netLoadProfit: net,
    profitPerMile: miles > 0 ? net / miles : null
  };
};

const MS_HOUR = 60 * 60 * 1000;
const DRIVE_LIMIT = 11 * MS_HOUR;
const WINDOW_LIMIT = 14 * MS_HOUR;

export const computeHosClocks = (dutyStartedAt, drivingStartedAt, currentStatus) => {
  const now = Date.now();
  const onDutyMs = dutyStartedAt ? now - new Date(dutyStartedAt).getTime() : 0;
  const drivingMs = (currentStatus === 'DRIVING' && drivingStartedAt)
    ? now - new Date(drivingStartedAt).getTime()
    : 0;

  return {
    driveRemainingMs: Math.max(DRIVE_LIMIT - drivingMs, 0),
    windowRemainingMs: Math.max(WINDOW_LIMIT - onDutyMs, 0),
    driveUsedHours: drivingMs / MS_HOUR,
    windowUsedHours: onDutyMs / MS_HOUR
  };
};

export const formatHoursRemaining = (ms) => {
  if (ms <= 0) return '0h 00m';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
};

export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import clsx from 'clsx';
import { ComplianceAPI, ExpenseAPI, ReportsAPI, FleetAPI, CategoriesAPI, OpsAPI, SyncManager } from '../services/api';
import {
  EMPTY_FORM,
  computeLocalMetrics,
  computeLoadProfitPreview,
  computeHosClocks,
  DEFAULT_DRIVING_LIMITS,
  computeFuelMpg,
  computeWeeklyFromExpenses,
  findPreviousFuelOdometer,
  formatHoursRemaining,
  downloadBlob,
  readFileAsDataUrl
} from '../utils/proMetrics';
import { getRegionProfile } from '../utils/regionProfile';
import LanguageCaption from './dashboard/LanguageCaption';
import { useTheme } from '../hooks/useTheme';
import { useNotifications, loadNotificationPref } from '../hooks/useNotifications';
import WeeklyChart from './dashboard/WeeklyChart';
import ReceiptGallery from './dashboard/ReceiptGallery';
import FleetDashboard from './dashboard/FleetDashboard';
import AdminPanel from './dashboard/AdminPanel';
import TripTracker from './dashboard/TripTracker';
import ThemeSwitcher from './dashboard/ThemeSwitcher';
import UpgradeGate from './dashboard/UpgradeGate';
import { useSubscription } from '../hooks/useSubscription';
import { useVoiceCapture } from '../hooks/useVoiceCapture';
import { DriverSettings } from '../utils/driverSettings';
import {
  DriverOpsStore,
  getEffectiveTargets,
  analyzeDriverOps,
  computeLoadDecision,
  emptyLoadPacket,
  emptyMaintenanceItem,
  latestOdometer
} from '../utils/driverOps';
import {
  COMPLIANCE_JURISDICTIONS,
  analyzeComplianceUpload,
  getComplianceJurisdiction,
  readComplianceFileText
} from '../utils/transportCompliance';
import { getCurrencyForJurisdiction, makeMoneyFormatter } from '../utils/currency';
import './Dashboard.css';

const DEFAULT_CATEGORIES = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'tolls', label: 'Tolls' },
  { value: 'food', label: 'Food/Hotel' },
  { value: 'other', label: 'Other' },
  { value: 'load', label: 'Load/Freight Income' }
];

const USUAL_EXPENSE_TEMPLATES = [
  { label: 'Fuel Stop', description: 'Fuel stop', category: 'fuel', type: 'expense' },
  { label: 'Toll Charge', description: 'Toll charge', category: 'tolls', type: 'expense' },
  { label: 'Food/Hotel', description: 'Food and hotel', category: 'food', type: 'expense' },
  { label: 'Maintenance', description: 'Truck maintenance', category: 'maintenance', type: 'expense' },
  { label: 'Load Income', description: 'Load payment', category: 'load', type: 'income' }
];

const nextCategoryForType = (type, currentCategory) => {
  if (type === 'income') {
    return currentCategory && currentCategory !== 'fuel' ? currentCategory : 'load';
  }
  if (currentCategory === 'load') return 'fuel';
  return currentCategory || 'fuel';
};

const HOS_STATUSES = [
  { value: 'OFF_DUTY', label: 'Resting (off duty)' },
  { value: 'SLEEPER', label: 'Sleeping in the cab' },
  { value: 'DRIVING', label: 'Driving' },
  { value: 'ON_DUTY', label: 'Working, not driving (loading, waiting)' }
];

const CATEGORY_LABEL_MAP = DEFAULT_CATEGORIES.reduce((acc, category) => {
  acc[category.value] = category.label;
  return acc;
}, {});

const normalizeCategoryValue = (value) => value
  .trim()
  .toLowerCase()
  .replace(/\s+/g, '-')
  .replace(/[^a-z0-9-]/g, '');

const getCategoryLabel = (value) => {
  if (!value) return 'Uncategorized';
  if (CATEGORY_LABEL_MAP[value]) return CATEGORY_LABEL_MAP[value];
  return value
    .split('-')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const Dashboard = ({ user, onLogout }) => {
  const toastTimerRef = useRef(null);
  const receiptInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('home');
  const [logView, setLogView] = useState('add');
  const [expenses, setExpenses] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [weeklySummary, setWeeklySummary] = useState(null);
  const [taxReport, setTaxReport] = useState(null);
  const [iftaReport, setIftaReport] = useState(null);
  const [reportQuarter, setReportQuarter] = useState(() => Math.ceil((new Date().getMonth() + 1) / 3));
  const [reportYear, setReportYear] = useState(() => new Date().getFullYear());
  const [fleetStatus, setFleetStatus] = useState(null);
  const [hosStatus, setHosStatus] = useState('OFF_DUTY');
  const [hosStartedAt, setHosStartedAt] = useState(null);
  const [drivingStartedAt, setDrivingStartedAt] = useState(null);
  const [hosClocks, setHosClocks] = useState(null);
  const [drivingLimits, setDrivingLimits] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`righand:${userId || 'default'}:drivingLimits`) || 'null');
      return saved ? { ...DEFAULT_DRIVING_LIMITS, ...saved } : DEFAULT_DRIVING_LIMITS;
    } catch {
      return DEFAULT_DRIVING_LIMITS;
    }
  });
  const { theme, setTheme, isNight } = useTheme();
  const [notificationsOn, setNotificationsOn] = useState(loadNotificationPref);
  const [profit, setProfit] = useState({ totalIncome: 0, totalExpenses: 0, netProfit: 0 });
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [editingExpense, setEditingExpense] = useState(null);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [filter, setFilter] = useState({ category: '', type: '' });
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [toast, setToast] = useState({ message: '', type: '' });
  const [exporting, setExporting] = useState('');
  const [customCategories, setCustomCategories] = useState([]);
  const [savedCategories, setSavedCategories] = useState([]);
  const [loadPackets, setLoadPackets] = useState([]);
  const [loadForm, setLoadForm] = useState(emptyLoadPacket);
  const [editingLoadId, setEditingLoadId] = useState(null);
  const [maintenanceItems, setMaintenanceItems] = useState([]);
  const [maintenanceForm, setMaintenanceForm] = useState(emptyMaintenanceItem);
  const [driverTargets, setDriverTargets] = useState(() => DriverOpsStore.getTargets('default'));
  const [opsLoaded, setOpsLoaded] = useState(false);

  const userId = localStorage.getItem('userId') || user?.id;
  const [openingIncome, setOpeningIncome] = useState(0);
  const isDemo = localStorage.getItem('authToken') === 'demo_token_12345';
  const [selectedJurisdictionCode, setSelectedJurisdictionCode] = useState(() => localStorage.getItem(`righand:${userId || 'default'}:jurisdiction`) || 'UG');
  const [complianceScans, setComplianceScans] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`righand:${userId || 'default'}:complianceScans`) || '[]');
    } catch {
      return [];
    }
  });
  const [complianceProfiles, setComplianceProfiles] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`righand:${userId || 'default'}:complianceProfiles`) || '[]');
    } catch {
      return [];
    }
  });
  const [complianceProfileForm, setComplianceProfileForm] = useState({
    profileType: 'driver',
    title: '',
    licenceExpiry: '',
    vehiclePlate: '',
    inspectionExpiry: '',
    insuranceReference: '',
    comesaYellowCard: '',
    axleLoadReference: '',
    routeCountries: '',
    borderPosts: '',
    notes: ''
  });
  const [complianceSummary, setComplianceSummary] = useState(null);
  const [complianceSyncStatus, setComplianceSyncStatus] = useState('local');
  const { subscription, isPro, refresh: refreshSubscription } = useSubscription(isDemo);

  // Verify Flutterwave payment after redirect back from checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') !== 'success' || params.get('gateway') !== 'flutterwave') return;
    const transactionId = params.get('transaction_id');
    const txRef = params.get('tx_ref');
    const tier = params.get('tier') || 'pro';
    if (!transactionId) return;
    // Remove billing params from URL without reload
    const clean = window.location.pathname;
    window.history.replaceState({}, '', clean);
    (async () => {
      try {
        const { SubscriptionAPI } = await import('../services/api');
        await SubscriptionAPI.verifyFlutterwavePayment({ transactionId, txRef, tier });
        await refreshSubscription();
        setToast({ message: 'Payment confirmed — features unlocked!', type: 'success' });
      } catch {
        setToast({ message: 'Payment received but verification failed. Contact support.', type: 'error' });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePaidUnlock = async () => {
    await refreshSubscription();
    await loadFleetStatus();
  };

  const allCategoryValues = useMemo(() => Array.from(new Set([
    ...DEFAULT_CATEGORIES.map(category => category.value),
    ...savedCategories.map(c => c.value),
    ...customCategories,
    ...expenses.map(expense => expense.category).filter(Boolean)
  ])), [savedCategories, customCategories, expenses]);

  const categoryLabelMap = useMemo(() => {
    const map = { ...CATEGORY_LABEL_MAP };
    savedCategories.forEach(c => { map[c.value] = c.label; });
    return map;
  }, [savedCategories]);

  const getCatLabel = useCallback((value) => {
    if (!value) return 'Uncategorized';
    if (categoryLabelMap[value]) return categoryLabelMap[value];
    return getCategoryLabel(value);
  }, [categoryLabelMap]);

  const localMetrics = useMemo(() => computeLocalMetrics(expenses), [expenses]);
  const displayMetrics = metrics || localMetrics;
  const loadPreview = useMemo(
    () => computeLoadProfitPreview(formData),
    [formData]
  );

  const pendingCount = expenses.filter(expense => expense.offline || expense.synced === false).length;
  const selectedJurisdiction = useMemo(
    () => getComplianceJurisdiction(selectedJurisdictionCode),
    [selectedJurisdictionCode]
  );
  const currencyCode = useMemo(
    () => getCurrencyForJurisdiction(selectedJurisdiction.code),
    [selectedJurisdiction.code]
  );
  const formatMoney = useMemo(() => makeMoneyFormatter(currencyCode), [currencyCode]);
  const region = useMemo(() => getRegionProfile(selectedJurisdiction.code), [selectedJurisdiction.code]);
  const latestComplianceScan = complianceScans[0] || null;
  const criticalComplianceCount = selectedJurisdiction.rules.filter(rule => rule.severity === 'critical').length;
  const latestExtractedFields = Object.entries(latestComplianceScan?.extractedFields || {});
  const profileCounts = useMemo(() => complianceProfiles.reduce((counts, profile) => {
    counts[profile.profileType] = (counts[profile.profileType] || 0) + 1;
    return counts;
  }, {}), [complianceProfiles]);
  const localReadinessAlerts = useMemo(() => {
    const missingProfiles = ['driver', 'vehicle', 'route'].filter(profileType => !profileCounts[profileType]);
    const alerts = [];
    if (missingProfiles.length) {
      alerts.push({
        level: 'warning',
        title: 'Details missing',
        body: `Add your ${missingProfiles.join(', ')} details before you dispatch.`
      });
    }
    if (latestComplianceScan?.reviewAlerts?.some(alert => alert.level === 'critical')) {
      alerts.push({
        level: 'critical',
        title: 'Serious problems found in your upload',
        body: 'Fix the serious problems found in your uploaded document before you release a trip file.'
      });
    }
    if (alerts.length) return alerts;
    return [{
      level: 'info',
      title: 'Details complete',
      body: 'Driver, vehicle and route details are saved for this country.'
    }];
  }, [latestComplianceScan, profileCounts]);
  const complianceReadinessAlerts = complianceSummary?.readinessAlerts || localReadinessAlerts;
  const dispatchBlockerCount = complianceReadinessAlerts.filter(alert => ['critical', 'warning'].includes(alert.level)).length;
  const localDispatchPolicy = useMemo(() => {
    const hasCriticalAlert = localReadinessAlerts.some(alert => alert.level === 'critical');
    if (hasCriticalAlert) {
      return {
        mode: 'block',
        blocked: true,
        title: 'Do not dispatch: serious compliance problems',
        reasons: ['Fix the serious problems found in your uploaded documents before you release this load.']
      };
    }
    return {
      mode: 'warn',
      blocked: false,
      title: 'You can dispatch, but check the warnings first',
      reasons: []
    };
  }, [localReadinessAlerts]);
  const dispatchPolicy = complianceSummary?.dispatchPolicy || localDispatchPolicy;

  const totalIncomeDisplay = (profit.totalIncome || 0) + openingIncome;
  const netProfitDisplay = totalIncomeDisplay - (profit.totalExpenses || 0);
  const netStatus = netProfitDisplay >= 0 ? 'positive' : 'negative';

  useNotifications({
    enabled: notificationsOn,
    pendingCount,
    netProfit: profit.netProfit,
    formatMoney
  });

  const prevFuelOdometer = useMemo(
    () => findPreviousFuelOdometer(expenses, formData.date),
    [expenses, formData.date]
  );
  const fuelMpgPreview = useMemo(
    () => computeFuelMpg(formData, prevFuelOdometer),
    [formData, prevFuelOdometer]
  );

  const weeklyDays = useMemo(() => {
    if (weeklySummary?.days) return weeklySummary.days;
    return computeWeeklyFromExpenses(expenses);
  }, [weeklySummary, expenses]);

  const effectiveTargets = useMemo(() => getEffectiveTargets(driverTargets, currencyCode), [driverTargets, currencyCode]);

  const driverAlerts = useMemo(() => analyzeDriverOps({
    expenses,
    loadPackets,
    maintenanceItems,
    targets: effectiveTargets,
    weeklyDays,
    formatMoney,
    units: {
      fuelUnit: region.fuelUnit.toLowerCase(),
      distanceUnit: region.distanceUnit,
      efficiencyUnit: region.efficiencyUnit,
      gapWarning: 880,
    },
  }), [expenses, loadPackets, maintenanceItems, effectiveTargets, weeklyDays, formatMoney, region]);

  const currentOdometer = useMemo(() => latestOdometer(expenses), [expenses]);
  const nextMaintenance = useMemo(() => {
    if (!maintenanceItems.length) return null;
    return [...maintenanceItems].sort((a, b) => {
      const aMiles = Number(a.dueOdometer) || Number.MAX_SAFE_INTEGER;
      const bMiles = Number(b.dueOdometer) || Number.MAX_SAFE_INTEGER;
      return aMiles - bMiles;
    })[0];
  }, [maintenanceItems]);
  const activeLoadPacket = useMemo(() => (
    loadPackets.find(packet => packet.status === 'active')
    || loadPackets.find(packet => packet.status === 'planned')
    || null
  ), [loadPackets]);
  const estimatedFuelRange = useMemo(() => {
    const fuelEntries = expenses
      .filter(entry => entry.category === 'fuel' && Number(entry.odometer) > 0 && Number(entry.gallons) > 0)
      .sort((a, b) => Number(b.odometer) - Number(a.odometer));
    if (fuelEntries.length < 2 || driverTargets.fuelLevelPct === '') return null;
    const current = fuelEntries[0];
    const previous = fuelEntries[1];
    const miles = Number(current.odometer) - Number(previous.odometer);
    const mpg = miles > 0 ? miles / Number(current.gallons) : null;
    if (!mpg) return null;
    return mpg * Number(driverTargets.tankGallons || 0) * (Number(driverTargets.fuelLevelPct) / 100);
  }, [expenses, driverTargets]);
  const fuelWatchText = useMemo(() => {
    if (estimatedFuelRange) return `${estimatedFuelRange.toFixed(0)} ${region.distanceUnit} range`;
    if (displayMetrics.costPerGallon) return `${formatMoney(displayMetrics.costPerGallon)}/${region.fuelUnitShort}`;
    return 'Add fuel stop';
  }, [displayMetrics.costPerGallon, estimatedFuelRange, formatMoney, region.distanceUnit, region.fuelUnitShort]);

  useEffect(() => {
    localStorage.setItem('customCategories', JSON.stringify(customCategories));
  }, [customCategories]);

  useEffect(() => {
    if (!opsLoaded) return;
    DriverOpsStore.saveLoadPackets(userId, loadPackets);
  }, [userId, loadPackets, opsLoaded]);

  useEffect(() => {
    if (!opsLoaded) return;
    DriverOpsStore.saveMaintenance(userId, maintenanceItems);
  }, [userId, maintenanceItems, opsLoaded]);

  useEffect(() => {
    DriverOpsStore.saveTargets(userId, driverTargets);
  }, [userId, driverTargets]);

  const loadCategories = useCallback(async () => {
    const remote = await CategoriesAPI.list();
    if (remote?.length) {
      setSavedCategories(remote);
    } else {
      try {
        const local = localStorage.getItem('customCategories');
        if (local) setCustomCategories(JSON.parse(local));
      } catch { /* ignore */ }
    }
  }, []);

  const loadWeeklySummary = useCallback(async () => {
    const data = await ReportsAPI.getWeeklySummary();
    if (data?.days) setWeeklySummary(data);
  }, []);

  const loadTaxReport = useCallback(async () => {
    const data = await ReportsAPI.getTaxQuarterly(reportYear, reportQuarter);
    if (data) setTaxReport(data);
  }, [reportQuarter, reportYear]);

  const loadIftaReport = useCallback(async () => {
    const data = await ReportsAPI.getIfta(reportYear, reportQuarter);
    if (data) setIftaReport(data);
  }, [reportQuarter, reportYear]);

  const toggleNotifications = async () => {
    if (!notificationsOn && 'Notification' in window && Notification.permission === 'default') {
      const granted = await Notification.requestPermission();
      if (granted !== 'granted') {
        showToast('Notifications blocked by browser.', 'warning');
        return;
      }
    }
    setNotificationsOn(prev => {
      showToast(prev ? 'Notifications off.' : 'Notifications enabled.', 'success');
      return !prev;
    });
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      setHosClocks(computeHosClocks(hosStartedAt, drivingStartedAt, hosStatus, drivingLimits));
    }, 30000);
    setHosClocks(computeHosClocks(hosStartedAt, drivingStartedAt, hosStatus, drivingLimits));
    return () => clearInterval(tick);
  }, [hosStartedAt, drivingStartedAt, hosStatus, drivingLimits]);

  const updateDrivingLimit = (field, value) => {
    setDrivingLimits(prev => {
      const next = { ...prev, [field]: value };
      localStorage.setItem(`righand:${userId || 'default'}:drivingLimits`, JSON.stringify(next));
      return next;
    });
  };

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast({ message: '', type: '' }), 2600);
  }, []);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      setSyncStatus('syncing');
      const data = await ExpenseAPI.getExpenses(userId);
      setExpenses(data || []);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('offline');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadMetrics = useCallback(async () => {
    const data = await ReportsAPI.getMetrics('monthly');
    if (data) setMetrics(data);
  }, []);

  const loadFleetStatus = useCallback(async () => {
    const data = await FleetAPI.getStatus();
    setFleetStatus(data);
  }, []);

  const loadHosStatus = useCallback(async () => {
    if (isDemo) {
      const saved = localStorage.getItem(`hos_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setHosStatus(parsed.status || 'OFF_DUTY');
        setHosStartedAt(parsed.startedAt || null);
        setDrivingStartedAt(parsed.drivingStartedAt || null);
      }
      return;
    }
    const data = await FleetAPI.getHosStatus();
    if (data) {
      setHosStatus(data.currentStatus || 'OFF_DUTY');
      setHosStartedAt(data.currentStartedAt || null);
      if (data.currentStatus === 'DRIVING') {
        setDrivingStartedAt(data.currentStartedAt);
      }
    }
  }, [isDemo, userId]);

  const loadDriverOps = useCallback(async () => {
    const localLoads = DriverOpsStore.getLoadPackets(userId);
    const localMaintenance = DriverOpsStore.getMaintenance(userId);
    setLoadPackets(localLoads);
    setMaintenanceItems(localMaintenance);

    if (isDemo) {
      setOpsLoaded(true);
      return;
    }

    try {
      const [remoteLoads, remoteMaintenance] = await Promise.all([
        OpsAPI.getLoadPackets(),
        OpsAPI.getMaintenanceItems()
      ]);
      setLoadPackets(remoteLoads.length ? remoteLoads : localLoads);
      setMaintenanceItems(remoteMaintenance.length ? remoteMaintenance : localMaintenance);
    } catch {
      showToast('Using local load and maintenance records until sync returns.', 'warning');
    } finally {
      setOpsLoaded(true);
    }
  }, [isDemo, showToast, userId]);

  const calculateProfit = useCallback(async () => {
    const startDate = new Date();
    startDate.setDate(1);
    const endDate = new Date();
    try {
      const profitData = await ExpenseAPI.calculateNetProfit(userId, startDate, endDate);
      setProfit(profitData);
    } catch {
      setProfit({
        totalIncome: localMetrics.totalIncome,
        totalExpenses: localMetrics.totalExpenses,
        netProfit: localMetrics.netProfit
      });
    }
  }, [localMetrics.netProfit, localMetrics.totalExpenses, localMetrics.totalIncome, userId]);

  useEffect(() => {
    loadExpenses();
    loadMetrics();
    loadWeeklySummary();
    loadCategories();
    loadFleetStatus();
    loadHosStatus();
    setOpeningIncome(DriverSettings.getOpeningIncome(userId));
    setDriverTargets(DriverOpsStore.getTargets(userId));
    loadDriverOps();
    SyncManager.enableAutoSync(userId, 30000);
  }, [loadCategories, loadDriverOps, loadExpenses, loadFleetStatus, loadHosStatus, loadMetrics, loadWeeklySummary, userId]);

  useEffect(() => {
    if (activeTab === 'reports') {
      loadTaxReport();
      loadIftaReport();
    }
  }, [activeTab, loadIftaReport, loadTaxReport]);

  useEffect(() => {
    calculateProfit();
  }, [calculateProfit, expenses]);

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] });
    setEditingExpense(null);
  };

  const startQuickEntry = (type = 'expense') => {
    setEditingExpense(null);
    setFormData({
      ...EMPTY_FORM,
      date: new Date().toISOString().split('T')[0],
      type,
      category: type === 'income' ? 'load' : 'fuel',
      description: type === 'income' ? 'Load payment' : ''
    });
    setActiveTab('log');
    setLogView('add');
  };

  const openHistoryFilter = (type) => {
    setFilter(prev => ({ ...prev, type: type || '' }));
    setActiveTab('log');
    setLogView('history');
  };

  const saveOpeningIncome = (amount) => {
    DriverSettings.setOpeningIncome(userId, amount);
    setOpeningIncome(amount);
    showToast('Starting income saved.', 'success');
  };

  const buildPayload = (data) => {
    const payload = {
      description: data.description,
      amount: Number.parseFloat(data.amount),
      category: data.category,
      type: data.type,
      date: data.date,
      notes: data.notes || undefined,
      receiptUrl: data.receiptUrl || undefined,
      broker: data.broker || undefined,
      customer: data.customer || undefined,
      fuelState: data.fuelState || undefined
    };
    ['miles', 'gallons', 'odometer', 'deadheadMiles', 'tollsAmount', 'fuelCostAlloc'].forEach((field) => {
      if (data[field] !== '' && data[field] !== null && data[field] !== undefined) {
        payload[field] = Number.parseFloat(data[field]);
      }
    });
    return payload;
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!formData.description || !formData.amount || !formData.category) {
      showToast('Please fill in description, amount, and category.', 'error');
      return;
    }

    try {
      setSyncStatus('syncing');
      const payload = buildPayload(formData);

      if (editingExpense) {
        const updated = await ExpenseAPI.updateExpense(editingExpense, payload, userId);
        setExpenses(prev => prev.map(e => (e.id === editingExpense.id ? { ...e, ...updated } : e)));
        showToast('Entry updated.', 'success');
      } else {
        const result = await ExpenseAPI.createExpense(payload, userId);
        showToast(
          result.offline ? 'Saved offline. Will sync when online.' : 'Entry saved.',
          result.offline ? 'warning' : 'success'
        );
      }

      resetForm();
      await loadExpenses();
      await loadMetrics();
      await loadWeeklySummary();
      setSyncStatus('synced');
      setActiveTab('log');
      setLogView('history');
    } catch {
      showToast('Failed to save entry.', 'error');
      setSyncStatus('error');
    }
  };

  const handleEditExpense = (expense) => {
    const entryType = expense.type || expense.expense_type || 'expense';
    setEditingExpense({
      ...expense,
      localId: expense.localId ?? expense.id
    });
    setFormData({
      description: expense.description || '',
      amount: expense.amount != null ? String(expense.amount) : '',
      category: expense.category || (entryType === 'income' ? 'load' : 'fuel'),
      type: entryType,
      date: expense.date ? expense.date.split('T')[0] : new Date().toISOString().split('T')[0],
      miles: expense.miles != null && expense.miles !== '' ? String(expense.miles) : '',
      gallons: expense.gallons != null && expense.gallons !== '' ? String(expense.gallons) : '',
      odometer: expense.odometer != null && expense.odometer !== '' ? String(expense.odometer) : '',
      deadheadMiles: expense.deadheadMiles != null && expense.deadheadMiles !== '' ? String(expense.deadheadMiles) : '',
      tollsAmount: expense.tollsAmount != null && expense.tollsAmount !== '' ? String(expense.tollsAmount) : '',
      fuelCostAlloc: expense.fuelCostAlloc != null && expense.fuelCostAlloc !== '' ? String(expense.fuelCostAlloc) : '',
      notes: expense.notes ?? '',
      receiptUrl: expense.receiptUrl ?? '',
      broker: expense.broker ?? '',
      customer: expense.customer ?? '',
      fuelState: expense.fuelState ?? ''
    });
    setActiveTab('log');
    setLogView('add');
  };

  const handleDeleteExpense = async (expense) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await ExpenseAPI.deleteExpense(expense, userId);
      setExpenses(prev => prev.filter(e => e.id !== expense.id));
      showToast('Entry deleted.', 'success');
      await loadMetrics();
    } catch {
      showToast('Unable to delete entry.', 'error');
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    if (name === 'category' && value === '__custom__') {
      setFormData(prev => ({ ...prev, category: '' }));
      return;
    }
    if (name === 'type') {
      setFormData(prev => ({
        ...prev,
        type: value,
        category: nextCategoryForType(value, prev.category)
      }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Receipt must be under 2 MB.', 'error');
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setFormData(prev => ({ ...prev, receiptUrl: dataUrl }));
    showToast('Receipt attached.', 'success');
  };

  const handleCreateCategory = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const normalizedCategory = normalizeCategoryValue(customCategoryInput);
    if (!normalizedCategory) {
      showToast('Enter a valid category name.', 'error');
      return;
    }
    const label = customCategoryInput.trim();
    if (!isDemo) {
      try {
        const created = await CategoriesAPI.create(label, formData.type);
        if (created) {
          setSavedCategories(prev => [...prev.filter(c => c.value !== created.value), created]);
        }
      } catch {
        setCustomCategories(prev => [...prev, normalizedCategory]);
      }
    } else {
      setCustomCategories(prev => [...prev, normalizedCategory]);
    }
    setFormData(prev => ({ ...prev, category: normalizedCategory }));
    setCustomCategoryInput('');
    showToast(`Category "${label}" added.`, 'success');
  };

  const applyVoiceCommand = useCallback((spokenText) => {
    const text = spokenText.toLowerCase();
    const categoryKeywords = [
      { keywords: ['fuel', 'diesel', 'gas'], category: 'fuel' },
      { keywords: ['maintenance', 'repair', 'service'], category: 'maintenance' },
      { keywords: ['toll', 'tolls'], category: 'tolls' },
      { keywords: ['food', 'hotel', 'meal', 'lodging'], category: 'food' },
      { keywords: ['load', 'freight', 'income', 'payment'], category: 'load' }
    ];
    const amountMatch = text.match(/(\d[\d,]*(?:\.\d{1,2})?)/);
    const parsedAmount = amountMatch ? amountMatch[1].replace(/,/g, '') : '';
    let parsedCategory = 'other';
    for (const rule of categoryKeywords) {
      if (rule.keywords.some(keyword => text.includes(keyword))) {
        parsedCategory = rule.category;
        break;
      }
    }
    const parsedType = (text.includes('income') || text.includes('load') || text.includes('payment'))
      ? 'income'
      : 'expense';
    const cleanedDescription = spokenText.replace(/\$?\d[\d,]*(\.\d{1,2})?/g, '').replace(/\s+/g, ' ').trim();

    setActiveTab('log');
    setLogView('add');
    setFormData(prev => ({
      ...prev,
      description: cleanedDescription || prev.description,
      amount: parsedAmount || prev.amount,
      category: parsedCategory,
      type: parsedType
    }));
    showToast(`Voice captured: "${spokenText}"`, 'success');
  }, [showToast]);

  const focusDescriptionField = useCallback(() => {
    document.getElementById('expense-description')?.focus();
  }, []);

  const {
    voiceAvailable,
    voiceHint,
    isListening,
    startVoiceCapture,
    stopVoiceCapture,
    toggleVoiceCapture,
  } = useVoiceCapture(applyVoiceCommand, focusDescriptionField);

  const beginVoiceCapture = (e) => {
    // Keep the gesture on the button so drifting or browser long-press handling can't end it early.
    e?.currentTarget?.setPointerCapture?.(e.pointerId);
    setActiveTab('log');
    setLogView('add');
    startVoiceCapture(e);
  };

  const beginVoiceToggle = () => {
    setActiveTab('log');
    setLogView('add');
    toggleVoiceCapture();
  };

  const logTripMiles = (miles) => {
    setEditingExpense(null);
    setFormData({
      ...EMPTY_FORM,
      date: new Date().toISOString().split('T')[0],
      type: 'income',
      category: 'load',
      description: 'Load payment',
      miles: miles != null ? String(miles) : ''
    });
    setActiveTab('log');
    setLogView('add');
    showToast(`Trip distance (${miles} ${region.distanceUnit}) ready to log.`, 'success');
  };

  const applyUsualTemplate = (template) => {
    setActiveTab('log');
    setLogView('add');
    setFormData(prev => ({
      ...prev,
      description: template.description,
      category: template.category,
      type: template.type
    }));
  };

  const handleExport = async (type, period) => {
    if (isDemo) {
      showToast('Export requires a live account.', 'warning');
      return;
    }
    try {
      setExporting(`${type}-${period}`);
      const blob = type === 'pdf'
        ? await ReportsAPI.downloadPdf(period, currencyCode)
        : await ReportsAPI.downloadCsv(period, currencyCode);
      downloadBlob(blob, `righand-${period}-report.${type === 'pdf' ? 'pdf' : 'csv'}`);
      showToast(`${period} ${type.toUpperCase()} downloaded.`, 'success');
    } catch {
      showToast(`Could not download ${type.toUpperCase()}.`, 'error');
    } finally {
      setExporting('');
    }
  };

  const persistComplianceScans = useCallback((scans) => {
    setComplianceScans(scans);
    localStorage.setItem(`righand:${userId || 'default'}:complianceScans`, JSON.stringify(scans));
  }, [userId]);

  const persistComplianceProfiles = useCallback((profiles) => {
    setComplianceProfiles(profiles);
    localStorage.setItem(`righand:${userId || 'default'}:complianceProfiles`, JSON.stringify(profiles));
  }, [userId]);

  const loadComplianceScans = useCallback(async (jurisdictionCode = selectedJurisdictionCode) => {
    if (isDemo) {
      setComplianceSyncStatus('local');
      return;
    }
    try {
      const documents = await ComplianceAPI.getDocuments(jurisdictionCode);
      if (documents.length) {
        persistComplianceScans(documents);
      }
      setComplianceSyncStatus('synced');
    } catch {
      setComplianceSyncStatus('local');
    }
  }, [isDemo, persistComplianceScans, selectedJurisdictionCode]);

  useEffect(() => {
    loadComplianceScans();
  }, [loadComplianceScans]);

  const loadComplianceProfiles = useCallback(async (jurisdictionCode = selectedJurisdictionCode) => {
    if (isDemo) return;
    try {
      const profiles = await ComplianceAPI.getProfiles(jurisdictionCode);
      persistComplianceProfiles(profiles);
      setComplianceSyncStatus('synced');
    } catch {
      setComplianceSyncStatus('local');
    }
  }, [isDemo, persistComplianceProfiles, selectedJurisdictionCode]);

  useEffect(() => {
    loadComplianceProfiles();
  }, [loadComplianceProfiles]);

  const loadComplianceSummary = useCallback(async (jurisdictionCode = selectedJurisdictionCode) => {
    if (isDemo) {
      setComplianceSummary(null);
      return;
    }
    try {
      const summary = await ComplianceAPI.getSummary(jurisdictionCode);
      setComplianceSummary(summary);
      setComplianceSyncStatus('synced');
    } catch {
      setComplianceSummary(null);
      setComplianceSyncStatus('local');
    }
  }, [isDemo, selectedJurisdictionCode]);

  useEffect(() => {
    loadComplianceSummary();
  }, [loadComplianceSummary]);

  const handleJurisdictionChange = (code) => {
    setSelectedJurisdictionCode(code);
    localStorage.setItem(`righand:${userId || 'default'}:jurisdiction`, code);
    loadComplianceScans(code);
    loadComplianceProfiles(code);
    loadComplianceSummary(code);
  };

  const handleComplianceProfileChange = (e) => {
    const { name, value } = e.target;
    setComplianceProfileForm(prev => ({ ...prev, [name]: value }));
  };

  const saveComplianceProfile = async (e) => {
    e.preventDefault();
    const title = complianceProfileForm.title.trim()
      || `${complianceProfileForm.profileType.charAt(0).toUpperCase()}${complianceProfileForm.profileType.slice(1)} profile`;
    const profile = {
      profileType: complianceProfileForm.profileType,
      jurisdictionCode: selectedJurisdictionCode,
      title,
      data: {
        licenceExpiry: complianceProfileForm.licenceExpiry,
        vehiclePlate: complianceProfileForm.vehiclePlate,
        inspectionExpiry: complianceProfileForm.inspectionExpiry,
        insuranceReference: complianceProfileForm.insuranceReference,
        comesaYellowCard: complianceProfileForm.comesaYellowCard,
        axleLoadReference: complianceProfileForm.axleLoadReference,
        routeCountries: complianceProfileForm.routeCountries,
        borderPosts: complianceProfileForm.borderPosts,
        notes: complianceProfileForm.notes,
      }
    };
    let savedProfile = { ...profile, id: `profile-${Date.now()}` };
    if (!isDemo) {
      try {
        savedProfile = await ComplianceAPI.saveProfile(profile);
        setComplianceSyncStatus('synced');
      } catch {
        setComplianceSyncStatus('local');
        showToast('Saved locally. Compliance profile will sync when backend access returns.', 'warning');
      }
    }
    persistComplianceProfiles([savedProfile, ...complianceProfiles].slice(0, 20));
    loadComplianceSummary();
    setComplianceProfileForm({
      profileType: 'driver',
      title: '',
      licenceExpiry: '',
      vehiclePlate: '',
      inspectionExpiry: '',
      insuranceReference: '',
      comesaYellowCard: '',
      axleLoadReference: '',
      routeCountries: '',
      borderPosts: '',
      notes: ''
    });
    showToast('Compliance profile saved.', 'success');
  };

  const deleteComplianceProfile = async (profileId) => {
    if (!isDemo) {
      try {
        await ComplianceAPI.deleteProfile(profileId);
        setComplianceSyncStatus('synced');
      } catch {
        setComplianceSyncStatus('local');
        showToast('Removed locally. Backend profile deletion will need sync later.', 'warning');
      }
    }
    persistComplianceProfiles(complianceProfiles.filter(profile => profile.id !== profileId));
    loadComplianceSummary();
  };

  const firstExtractedValue = (field) => {
    const value = latestComplianceScan?.extractedFields?.[field];
    return Array.isArray(value) ? value[0] || '' : value || '';
  };

  const prefillComplianceProfileFromScan = () => {
    if (!latestComplianceScan?.extractedFields) {
      showToast('Upload a compliance document before prefilling a profile.', 'warning');
      return;
    }
    const driverName = firstExtractedValue('driverNames');
    const vehiclePlate = firstExtractedValue('vehiclePlates');
    const borderPosts = latestComplianceScan.extractedFields.borderPosts || [];
    const dates = latestComplianceScan.extractedFields.dates || [];
    const nextDate = Array.isArray(dates) ? dates[0] || '' : dates;
    setComplianceProfileForm(prev => ({
      ...prev,
      title: prev.title || driverName || vehiclePlate || `${selectedJurisdiction.label} route readiness`,
      licenceExpiry: prev.profileType === 'driver' ? prev.licenceExpiry || nextDate : prev.licenceExpiry,
      vehiclePlate: prev.vehiclePlate || vehiclePlate,
      inspectionExpiry: prev.profileType === 'vehicle' ? prev.inspectionExpiry || nextDate : prev.inspectionExpiry,
      routeCountries: prev.routeCountries || selectedJurisdiction.label,
      borderPosts: prev.borderPosts || (Array.isArray(borderPosts) ? borderPosts.join(', ') : borderPosts),
      notes: prev.notes || `Prefilled from ${latestComplianceScan.fileName}`
    }));
  };

  const handleComplianceUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Compliance document must be under 5 MB.', 'error');
      return;
    }
    let savedScan = null;
    let remoteSaveFailed = false;
    if (!isDemo) {
      try {
        savedScan = await ComplianceAPI.uploadDocument({
          file,
          jurisdictionCode: selectedJurisdictionCode,
          jurisdictionLabel: selectedJurisdiction.label
        });
        setComplianceSyncStatus('synced');
      } catch {
        remoteSaveFailed = true;
        setComplianceSyncStatus('local');
        showToast('Saved locally. Compliance scan will stay on this device until sync returns.', 'warning');
      }
    }
    if (!savedScan) {
      const text = await readComplianceFileText(file);
      savedScan = analyzeComplianceUpload({
        jurisdictionCode: selectedJurisdictionCode,
        fileName: file.name,
        mimeType: file.type,
        text
      });
    }
    persistComplianceScans([savedScan, ...complianceScans].slice(0, 10));
    loadComplianceSummary();
    if (!remoteSaveFailed) {
      showToast(savedScan.directHit ? 'Compliance scan matched regional rules.' : 'Compliance scan added the core checklist.', 'success');
    }
    e.target.value = '';
  };

  const handleLoadFormChange = (e) => {
    const { name, value } = e.target;
    setLoadForm(prev => ({ ...prev, [name]: value }));
  };

  const saveLoadPacket = async (e) => {
    e.preventDefault();
    if (!loadForm.broker && !loadForm.shipper && !loadForm.loadNumber) {
      showToast('Add a freight agent, sender or order number first.', 'error');
      return;
    }
    const packet = {
      ...loadForm,
      id: editingLoadId || loadForm.id || `load-${Date.now()}`,
      updatedAt: new Date().toISOString(),
      createdAt: loadForm.createdAt || new Date().toISOString()
    };
    let savedPacket = packet;
    if (!isDemo) {
      try {
        savedPacket = editingLoadId
          ? await OpsAPI.saveLoadPacket(packet)
          : await OpsAPI.createLoadPacket(packet);
      } catch {
        showToast('Saved on this phone. The trip file will upload when you have signal again.', 'warning');
      }
    }
    setLoadPackets(prev => [
      savedPacket,
      ...prev.filter(item => item.id !== savedPacket.id)
    ]);
    setLoadForm(emptyLoadPacket());
    setEditingLoadId(null);
    showToast('Trip file saved.', 'success');
  };

  const editLoadPacket = (packet) => {
    setLoadForm(packet);
    setEditingLoadId(packet.id);
    setActiveTab('loads');
  };

  const deleteLoadPacket = async (packetId) => {
    if (!window.confirm('Delete this trip file?')) return;
    if (!isDemo) {
      try {
        await OpsAPI.deleteLoadPacket(packetId);
      } catch {
        showToast('Deleted locally. Server delete could not sync yet.', 'warning');
      }
    }
    setLoadPackets(prev => prev.filter(packet => packet.id !== packetId));
    if (editingLoadId === packetId) {
      setLoadForm(emptyLoadPacket());
      setEditingLoadId(null);
    }
    showToast('Trip file deleted.', 'success');
  };

  const setLoadStatus = async (packetId, status) => {
    const current = loadPackets.find(packet => packet.id === packetId);
    if (!current) return;
    if (status === 'delivered' && dispatchPolicy.blocked) {
      showToast(dispatchPolicy.title || 'Do not dispatch: compliance problems found.', 'error');
      setActiveTab('compliance');
      return;
    }
    const updated = { ...current, status, updatedAt: new Date().toISOString() };
    if (!isDemo) {
      try {
        await OpsAPI.saveLoadPacket(updated);
      } catch {
        showToast('Status saved locally. Server sync will need retry.', 'warning');
      }
    }
    setLoadPackets(prev => prev.map(packet => (
      packet.id === packetId ? updated : packet
    )));
  };

  const logLoadPacketIncome = (packet) => {
    setEditingExpense(null);
    setFormData({
      ...EMPTY_FORM,
      date: packet.deliveryDate || packet.pickupDate || new Date().toISOString().split('T')[0],
      type: 'income',
      category: 'load',
      description: packet.loadNumber ? `Load ${packet.loadNumber}` : `Load payment - ${packet.broker || packet.shipper || 'freight agent'}`,
      amount: packet.rate ? String(packet.rate) : '',
      miles: packet.loadedMiles ? String(packet.loadedMiles) : '',
      deadheadMiles: packet.deadheadMiles ? String(packet.deadheadMiles) : '',
      tollsAmount: packet.tolls ? String(packet.tolls) : '',
      fuelCostAlloc: packet.fuelEstimate ? String(packet.fuelEstimate) : '',
      broker: packet.broker || '',
      customer: packet.shipper || '',
      notes: [
        packet.receiver ? `Receiver: ${packet.receiver}` : '',
        packet.detentionTerms ? `Waiting-time charges: ${packet.detentionTerms}` : '',
        packet.notes || ''
      ].filter(Boolean).join(' | ')
    });
    setActiveTab('log');
    setLogView('add');
    showToast('Trip file ready to save as income.', 'success');
  };

  const buildLoadPacketText = (packet) => {
    const decision = computeLoadDecision(packet, effectiveTargets);
    const netPerMileText = decision.netPerMile ? `${formatMoney(decision.netPerMile)}/${region.distanceUnit}` : 'missing distance';
    return [
      'RigHand Trip File',
      packet.loadNumber ? `Order: ${packet.loadNumber}` : '',
      packet.broker ? `Freight agent: ${packet.broker}` : '',
      packet.shipper ? `Pickup: ${packet.shipper} ${packet.pickupDate || ''}` : '',
      packet.receiver ? `Delivery: ${packet.receiver} ${packet.deliveryDate || ''}` : '',
      packet.pickupAddress ? `Pickup address: ${packet.pickupAddress}` : '',
      packet.deliveryAddress ? `Delivery address: ${packet.deliveryAddress}` : '',
      `Rate: ${formatMoney(packet.rate || 0)}`,
      `Distance (${region.distanceUnit}): ${decision.totalMiles || 0}`,
      `Net: ${formatMoney(decision.net)} (${netPerMileText})`,
      packet.detentionTerms ? `Waiting-time charges: ${packet.detentionTerms}` : '',
      packet.notes ? `Notes: ${packet.notes}` : ''
    ].filter(Boolean).join('\n');
  };

  const downloadLoadPacket = (packet) => {
    const blob = new Blob([buildLoadPacketText(packet)], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `righand-load-${packet.loadNumber || packet.id}.txt`);
    showToast('Trip file downloaded.', 'success');
  };

  const shareLoadPacket = (packet) => {
    const text = buildLoadPacketText(packet);
    if (navigator.share) {
      navigator.share({ title: 'RigHand Trip File', text }).catch(() => {});
      return;
    }
    window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
  };

  const handleMaintenanceFormChange = (e) => {
    const { name, value } = e.target;
    setMaintenanceForm(prev => ({ ...prev, [name]: value }));
  };

  const saveMaintenanceItem = async (e) => {
    e.preventDefault();
    if (!maintenanceForm.name) {
      showToast('Add a maintenance item name.', 'error');
      return;
    }
    const item = {
      ...maintenanceForm,
      id: maintenanceForm.id || `maint-${Date.now()}`,
      updatedAt: new Date().toISOString()
    };
    let savedItem = item;
    if (!isDemo) {
      try {
        savedItem = maintenanceForm.id
          ? await OpsAPI.saveMaintenanceItem(item)
          : await OpsAPI.createMaintenanceItem(item);
      } catch {
        showToast('Saved locally. Maintenance reminder will stay on this device until sync returns.', 'warning');
      }
    }
    setMaintenanceItems(prev => [savedItem, ...prev.filter(row => row.id !== savedItem.id)]);
    setMaintenanceForm(emptyMaintenanceItem());
    showToast('Maintenance reminder saved.', 'success');
  };

  const completeMaintenanceItem = async (item) => {
    const current = currentOdometer || Number(item.dueOdometer) || 0;
    const nextDue = item.name.toLowerCase().includes('oil') && current
      ? current + 15000
      : '';
    const updated = { ...item, lastCompletedOdometer: current || '', dueOdometer: nextDue, updatedAt: new Date().toISOString() };
    if (!isDemo) {
      try {
        await OpsAPI.saveMaintenanceItem(updated);
      } catch {
        showToast('Completion saved locally. Server sync will need retry.', 'warning');
      }
    }
    setMaintenanceItems(prev => prev.map(row => (
      row.id === item.id
        ? updated
        : row
    )));
    showToast('Maintenance marked complete.', 'success');
  };

  const handleHosChange = async (status) => {
    const now = new Date().toISOString();
    if (isDemo) {
      let drivingStart = null;
      if (status === 'DRIVING') {
        drivingStart = now;
      } else if (hosStatus === 'DRIVING') {
        drivingStart = drivingStartedAt;
      }
      const payload = {
        status,
        startedAt: now,
        drivingStartedAt: drivingStart
      };
      localStorage.setItem(`hos_${userId}`, JSON.stringify(payload));
      setHosStatus(status);
      setHosStartedAt(now);
      setDrivingStartedAt(drivingStart);
      showToast(`Duty status: ${status.replace('_', ' ')}`, 'success');
      return;
    }

    try {
      await FleetAPI.setHosStatus(status);
      setHosStatus(status);
      setHosStartedAt(now);
      if (status === 'DRIVING') setDrivingStartedAt(now);
      showToast(`Duty status updated.`, 'success');
    } catch {
      showToast('Could not update your driving status.', 'error');
    }
  };

  const filteredExpenses = expenses.filter(e => {
    if (filter.category && e.category !== filter.category) return false;
    if (filter.type && e.type !== filter.type) return false;
    if (searchText) {
      const query = searchText.toLowerCase();
      const haystack = `${e.description} ${e.category} ${e.type}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    if (sortBy === 'date_asc') return new Date(a.date) - new Date(b.date);
    if (sortBy === 'amount_desc') return (Number(b.amount) || 0) - (Number(a.amount) || 0);
    if (sortBy === 'amount_asc') return (Number(a.amount) || 0) - (Number(b.amount) || 0);
    return new Date(b.date) - new Date(a.date);
  });

  const adminExpenses = useMemo(
    () => [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [expenses]
  );

  const profitStatus = netStatus;

  const renderHome = () => (
    <>
      <div className="quick-actions">
        <button type="button" className="btn-primary" onClick={() => startQuickEntry('income')}>+ Add Income</button>
        <button type="button" className="btn-secondary" onClick={() => startQuickEntry('expense')}>+ Add Expense</button>
        <button type="button" className="btn-secondary" onClick={() => setActiveTab('loads')}>+ Trip File</button>
      </div>

      <section className="cockpit-grid">
        <article className="cockpit-card primary">
          <span className="metric-label">Today</span>
          <strong>{activeLoadPacket ? (activeLoadPacket.loadNumber || activeLoadPacket.broker || activeLoadPacket.shipper) : 'No active load'}</strong>
          <p>{activeLoadPacket ? `${activeLoadPacket.shipper || 'Pickup'} to ${activeLoadPacket.receiver || 'delivery'}` : 'Create your first trip file to track the agreed rate, documents and delivery.'}</p>
          <button type="button" className="link-btn" onClick={() => setActiveTab('loads')}>
            {activeLoadPacket ? 'Open trip file' : 'Create trip file'}
          </button>
        </article>
        <article className="cockpit-card">
          <span className="metric-label">Fuel Watch</span>
          <strong>{fuelWatchText}</strong>
          <p>{displayMetrics.fuelCostPerMile ? `${formatMoney(displayMetrics.fuelCostPerMile)}/${region.distanceUnit} fuel cost` : `${region.fuelUnit}, odometer, and country unlock ${region.efficiencyUnit} and cross-border fuel checks.`}</p>
          <div className="fuel-watch-inputs">
            <input
              type="number"
              min="0"
              max="100"
              value={driverTargets.fuelLevelPct}
              onChange={(e) => setDriverTargets(prev => ({ ...prev, fuelLevelPct: e.target.value }))}
              placeholder="Fuel %"
              aria-label="Fuel level percent"
            />
            <input
              type="number"
              min="1"
              value={driverTargets.tankGallons}
              onChange={(e) => setDriverTargets(prev => ({ ...prev, tankGallons: e.target.value }))}
              placeholder={`Tank ${region.fuelUnitShort}`}
              aria-label={`Tank capacity in ${region.fuelUnit.toLowerCase()}`}
            />
          </div>
        </article>
        <article className="cockpit-card">
          <span className="metric-label">Next Maintenance</span>
          <strong>{nextMaintenance ? nextMaintenance.name : 'No reminders'}</strong>
          <p>{nextMaintenance?.dueOdometer ? `Due at ${Number(nextMaintenance.dueOdometer).toLocaleString()} ${region.distanceUnit}` : 'Add oil, tyres, vehicle inspection, insurance or registration reminders.'}</p>
        </article>
        <article className="cockpit-card">
          <span className="metric-label">Compliance Assistant</span>
          <strong>{selectedJurisdiction.label}</strong>
          <p>{criticalComplianceCount} critical checks active. {latestComplianceScan ? `Last scan: ${latestComplianceScan.fileName}` : 'Upload permits, inspection, customs, or driver files.'}</p>
          <button type="button" className="link-btn" onClick={() => setActiveTab('compliance')}>Open compliance</button>
        </article>
      </section>

      <section className="automation-panel">
        <div className="section-heading-row">
          <div>
            <h2>Driver Alerts</h2>
            <p className="section-help">RigHand watches fuel, cross-border fuel records, maintenance, loads, and profit targets while you drive.</p>
          </div>
          <button type="button" className="link-btn" onClick={() => setActiveTab('loads')}>Trip Files</button>
        </div>
        <div className="form-group weekly-goal-field">
          <label htmlFor="weekly-profit-goal">Weekly profit goal ({currencyCode})</label>
          <input
            id="weekly-profit-goal"
            type="number"
            min="0"
            step="1000"
            value={driverTargets.customWeeklyProfit ?? ''}
            placeholder={String(effectiveTargets.targetWeeklyProfit)}
            onChange={(e) => setDriverTargets(prev => ({ ...prev, customWeeklyProfit: e.target.value }))}
          />
        </div>
        {driverAlerts.length === 0 ? (
          <p className="admin-empty">No warnings yet. Add fuel, load, and maintenance records to activate automation.</p>
        ) : (
          <div className="automation-alert-list">
            {driverAlerts.slice(0, 4).map((alert, index) => (
              <article key={`${alert.title}-${index}`} className={clsx('automation-alert', alert.level)}>
                <strong>{alert.title}</strong>
                <p>{alert.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <TripTracker userId={userId} onLogMiles={logTripMiles} />

      <section className="hero-metric hero-with-truck">
        <div className="hero-truck-imprint" aria-hidden="true">
          <img src={`${process.env.PUBLIC_URL}/truck-console-bg.png`} alt="" />
        </div>
        <div className="hero-metric-content">
          <p className="hero-label">Net Profit This Month</p>
          <p className={clsx('hero-value', profitStatus)}>{formatMoney(netProfitDisplay)}</p>
          {openingIncome > 0 && (
            <p className="hero-opening">Includes {formatMoney(openingIncome)} starting income</p>
          )}
        </div>
      </section>

      <section className="profit-summary">
        <button type="button" className="profit-card income clickable" onClick={() => openHistoryFilter('income')}>
          <h3>Income</h3>
          <p className="amount">{formatMoney(totalIncomeDisplay)}</p>
          <span className="card-action-hint">Tap to view / edit</span>
        </button>
        <button type="button" className="profit-card expenses clickable" onClick={() => openHistoryFilter('expense')}>
          <h3>Expenses</h3>
          <p className="amount">{formatMoney(profit.totalExpenses)}</p>
          <span className="card-action-hint">Tap to view / edit</span>
        </button>
        <div className={`profit-card net-profit ${profitStatus}`}>
          <h3>Net Profit</h3>
          <p className="amount">{formatMoney(netProfitDisplay)}</p>
        </div>
      </section>

      <section className="metrics-grid">
        <div className="metric-card highlight">
          <span className="metric-label">Profit / {region.distanceUnit}</span>
          <strong>{formatMoney(displayMetrics.profitPerMile)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Fuel {currencyCode} / {region.distanceUnit}</span>
          <strong>{formatMoney(displayMetrics.fuelCostPerMile)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">{currencyCode} / {region.fuelUnit === 'Litres' ? 'Litre' : region.fuelUnit}</span>
          <strong>{formatMoney(displayMetrics.costPerGallon)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Loaded {region.distanceUnit}</span>
          <strong>{displayMetrics.loadedMiles ? displayMetrics.loadedMiles.toFixed(1) : '—'}</strong>
        </div>
      </section>

      <WeeklyChart days={weeklyDays} title="This Week" formatMoney={formatMoney} />

      <section className="feature-banner theme-banner compact-banner">
        <strong>Theme</strong>
        <ThemeSwitcher theme={theme} setTheme={setTheme} />
      </section>

      <section className="insight-strip">
        <div className="insight-pill"><span className="insight-label">Waiting to upload</span><strong>{pendingCount}</strong></div>
        <div className="insight-pill"><span className="insight-label">Entries</span><strong>{expenses.length}</strong></div>
        <div className="insight-pill"><span className="insight-label">Alerts</span>
          <button type="button" className="link-btn" onClick={toggleNotifications}>{notificationsOn ? 'On' : 'Off'}</button>
        </div>
      </section>

      <section className="usual-expenses-section">
        <h2>Quick Templates</h2>
        <div className="usual-expenses-grid">
          {USUAL_EXPENSE_TEMPLATES.map(template => (
            <button key={template.label} type="button" className="usual-expense-btn" onClick={() => applyUsualTemplate(template)}>
              {template.label}
            </button>
          ))}
        </div>
      </section>
    </>
  );

  const showFuelFields = formData.category === 'fuel';
  const showLoadFields = formData.category === 'load' && formData.type === 'income';
  const entryFormTitle = useMemo(() => {
    if (!editingExpense) return 'New Entry';
    return formData.type === 'income' ? 'Edit Income' : 'Edit Entry';
  }, [editingExpense, formData.type]);

  const renderAddForm = () => (
    <section className="expense-form-section">
      <h2>{entryFormTitle}</h2>
      <div className="entry-type-toggle">
        <button
          type="button"
          className={clsx('toggle-btn', formData.type === 'expense' && 'active')}
          onClick={() => handleFormChange({ target: { name: 'type', value: 'expense' } })}
        >
          Expense
        </button>
        <button
          type="button"
          className={clsx('toggle-btn', formData.type === 'income' && 'active')}
          onClick={() => handleFormChange({ target: { name: 'type', value: 'income' } })}
        >
          Income
        </button>
      </div>
      <form onSubmit={handleSaveExpense} className="expense-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="expense-description">Description</label>
            <input id="expense-description" type="text" name="description" value={formData.description} onChange={handleFormChange} required />
            <div className="voice-controls">
              <button
                type="button"
                className={clsx('btn-secondary voice-btn voice-btn-ptt', isListening && 'listening')}
                disabled={!voiceAvailable}
                onPointerDown={beginVoiceCapture}
                onPointerUp={stopVoiceCapture}
                onContextMenu={(e) => e.preventDefault()}
              >
                {isListening ? 'Release To Finish' : 'Hold To Talk'}
              </button>
              <button
                type="button"
                className="btn-secondary voice-btn-tap"
                disabled={!voiceAvailable}
                onClick={beginVoiceToggle}
              >
                {isListening ? 'Stop' : 'Tap To Talk'}
              </button>
              {voiceHint && <small className="voice-hint">{voiceHint}</small>}
              {!voiceAvailable && !voiceHint && (
                <small className="voice-hint">Allow microphone access to enable voice entry.</small>
              )}
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="expense-amount">Amount ({currencyCode})</label>
            <input id="expense-amount" type="number" name="amount" value={formData.amount} onChange={handleFormChange} step="0.01" min="0" required />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="expense-type">Type</label>
            <select id="expense-type" name="type" value={formData.type} onChange={handleFormChange}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="expense-category">Category</label>
            <select id="expense-category" name="category" value={formData.category} onChange={handleFormChange}>
              <option value="">Select category</option>
              {allCategoryValues.map(category => (
                <option key={category} value={category}>{getCatLabel(category)}</option>
              ))}
              <option value="__custom__">+ Create New Category</option>
            </select>
          </div>
        </div>

        {formData.category === '' && (
          <div className="category-create-group">
            <input
              type="text"
              value={customCategoryInput}
              onChange={e => setCustomCategoryInput(e.target.value)}
              placeholder="New category name"
            />
            <button type="button" className="btn-secondary" onClick={handleCreateCategory}>Save Category</button>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="expense-miles">Distance in {region.distanceUnit} {showLoadFields ? '(loaded)' : '(optional)'}</label>
            <input id="expense-miles" type="number" name="miles" value={formData.miles} onChange={handleFormChange} step="0.1" min="0" placeholder="Trip or loaded distance" />
          </div>
          <div className="form-group">
            <label htmlFor="expense-odometer">Odometer (optional)</label>
            <input id="expense-odometer" type="number" name="odometer" value={formData.odometer} onChange={handleFormChange} step="0.1" min="0" />
          </div>
        </div>

        {showFuelFields && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expense-gallons">{region.fuelUnit} (fuel log)</label>
                <input id="expense-gallons" type="number" name="gallons" value={formData.gallons} onChange={handleFormChange} step="0.01" min="0" placeholder={region.fuelLogPlaceholder} />
              </div>
              <div className="form-group">
                <label htmlFor="expense-fuel-state">{region.fuelLocationLabel}</label>
                <select id="expense-fuel-state" name="fuelState" value={formData.fuelState} onChange={handleFormChange}>
                  <option value="">{region.fuelLocationPlaceholder}</option>
                  {region.fuelLocations.map(s => (
                    <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group fuel-calc-preview">
                <span className="form-label">{currencyCode} / {region.fuelUnit === 'Litres' ? 'Litre' : region.fuelUnit}</span>
                <p>
                  {formData.gallons && formData.amount
                    ? formatMoney(Number.parseFloat(formData.amount) / Number.parseFloat(formData.gallons))
                    : '—'}
                </p>
              </div>
              <div className="form-group fuel-calc-preview">
                <span className="form-label">{region.efficiencyUnit} (auto-calc)</span>
                <p>{fuelMpgPreview ? `${fuelMpgPreview.toFixed(1)} ${region.efficiencyUnit}` : `Add ${region.fuelUnit.toLowerCase()} + ${region.distanceUnit} or odometer`}</p>
                {prevFuelOdometer ? <small>Prev odometer: {prevFuelOdometer}</small> : null}
              </div>
            </div>
          </>
        )}

        {showLoadFields && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expense-broker">Freight agent</label>
                                <input id="expense-broker" type="text" name="broker" value={formData.broker} onChange={handleFormChange} placeholder="e.g. freight agent or transporter" />
              </div>
              <div className="form-group">
                <label htmlFor="expense-customer">Customer / Sender</label>
                <input id="expense-customer" type="text" name="customer" value={formData.customer} onChange={handleFormChange} placeholder="Who you hauled for" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expense-deadhead-miles">Empty-run distance ({region.distanceUnit})</label>
                <input id="expense-deadhead-miles" type="number" name="deadheadMiles" value={formData.deadheadMiles} onChange={handleFormChange} step="0.1" min="0" />
              </div>
              <div className="form-group">
                <label htmlFor="expense-tolls">Tolls ({currencyCode})</label>
                <input id="expense-tolls" type="number" name="tollsAmount" value={formData.tollsAmount} onChange={handleFormChange} step="0.01" min="0" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expense-fuel-cost-alloc">Fuel Cost for Load ({currencyCode})</label>
                <input id="expense-fuel-cost-alloc" type="number" name="fuelCostAlloc" value={formData.fuelCostAlloc} onChange={handleFormChange} step="0.01" min="0" />
              </div>
              <div className="form-group load-calc-preview">
                <span className="form-label">Load Net Profit</span>
                <p>{formatMoney(loadPreview.netLoadProfit)}</p>
                <small>{loadPreview.profitPerMile ? `${formatMoney(loadPreview.profitPerMile)}/${region.distanceUnit}` : 'Add loaded distance'}</small>
              </div>
            </div>
          </>
        )}

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="expense-date">Date</label>
            <input id="expense-date" type="date" name="date" value={formData.date} onChange={handleFormChange} required />
          </div>
          <div className="form-group">
            <label htmlFor="expense-receipt">Receipt Photo</label>
            <input id="expense-receipt" ref={receiptInputRef} type="file" accept="image/*" capture="environment" onChange={handleReceiptUpload} />
            {formData.receiptUrl && <span className="receipt-attached">Receipt attached</span>}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="expense-notes">Notes</label>
            <input id="expense-notes" type="text" name="notes" value={formData.notes} onChange={handleFormChange} placeholder="Optional" />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary">{editingExpense ? 'Update Entry' : 'Save Entry'}</button>
          {editingExpense && (
            <button type="button" className="btn-secondary" onClick={resetForm}>Cancel Edit</button>
          )}
        </div>
      </form>
    </section>
  );

  const renderHistoryContent = () => {
    if (loading) return <p className="loading">Loading...</p>;
    if (sortedExpenses.length === 0) return <div className="no-data"><p>No entries yet.</p></div>;
    return (
      <div className="expense-cards">
        {sortedExpenses.map(expense => (
          <article key={expense.id} className={clsx('expense-card', expense.offline && 'offline')}>
              <div className="expense-card-top">
                <div>
                  <h3>{expense.description}</h3>
                  <p className="expense-card-meta">
                    {new Date(expense.date).toLocaleDateString('en-GB')} · {getCatLabel(expense.category)}
                  </p>
                </div>
                <p className={clsx('expense-card-amount', expense.type === 'income' ? 'income-amount' : 'expense-amount')}>
                  {expense.type === 'income' ? '+' : '-'}{formatMoney(Math.abs(expense.amount))}
                </p>
              </div>
              <div className="expense-card-tags">
                {expense.miles ? <span className="badge">{expense.miles} {region.distanceUnit}</span> : null}
                {expense.gallons ? <span className="badge">{expense.gallons} {region.fuelUnitShort}</span> : null}
                {expense.broker ? <span className="badge">{expense.broker}</span> : null}
                {expense.customer ? <span className="badge">{expense.customer}</span> : null}
                {expense.fuelState ? <span className="badge">{expense.fuelState}</span> : null}
                {expense.receiptUrl ? <span className="badge receipt-badge">Receipt</span> : null}
              </div>
              <div className="expense-card-actions">
                <button type="button" className="btn-secondary small" onClick={() => handleEditExpense(expense)}>Edit</button>
                <button type="button" className="btn-delete" onClick={() => handleDeleteExpense(expense)} title="Delete">Delete</button>
              </div>
          </article>
        ))}
      </div>
    );
  };

  const renderHistory = () => (
    <section className="expenses-section">
      <h2>History</h2>
      <div className="filters">
        <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search" className="filter-input" />
        <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })} className="filter-select">
          <option value="">All Types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="filter-select">
          <option value="date_desc">Newest</option>
          <option value="date_asc">Oldest</option>
          <option value="amount_desc">Amount High-Low</option>
        </select>
      </div>

      {renderHistoryContent()}
    </section>
  );

  const renderLoadCompliancePanel = () => {
    const criticalRules = selectedJurisdiction.rules.filter(rule => rule.severity === 'critical');
    const latestMatches = latestComplianceScan?.matches || [];
    const routeProfiles = complianceProfiles.filter(profile => profile.profileType === 'route');
    const extractedFields = latestComplianceScan?.extractedFields || {};
    const routeText = routeProfiles.map(profile => Object.values(profile.data || {}).join(' ')).join(' ').toLowerCase();
    const hasBorderEvidence = routeProfiles.length > 0 || (extractedFields.borderPosts || []).length > 0;
    const shouldShowBorderChecklist = ['EAC', 'EU'].includes(selectedJurisdiction.code) || hasBorderEvidence;
    const customsChecklist = selectedJurisdiction.code === 'EU'
      ? ['Community licence', 'International carriage evidence', 'Cabotage operation records', 'Posting declaration', 'Tachograph or driver card evidence']
      : ['Customs declaration', 'Cargo manifest', 'Bond or transit reference', 'COMESA Yellow Card', 'Seal number', 'Border crossing record', 'Weighbridge evidence', 'Verified axle/load source'];
    const checklistEvidence = `${routeText} ${(extractedFields.permitIds || []).join(' ')} ${(extractedFields.sealNumbers || []).join(' ')} ${(extractedFields.borderPosts || []).join(' ')}`.toLowerCase();
    return (
      <section className="compliance-panel-block load-compliance-panel">
        <div className="section-heading-row">
          <div>
            <span className="metric-label">Trip checklist</span>
            <h3>{selectedJurisdiction.label} checklist</h3>
            <p className="section-help">These checks follow the country you selected. Go through them before you start the trip.</p>
          </div>
          <button type="button" className="link-btn" onClick={() => setActiveTab('compliance')}>Upload a document</button>
        </div>
        <div className="compliance-status-grid">
          <div className="metric-card">
            <span className="metric-label">Serious rules</span>
            <strong>{criticalRules.length}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Last upload</span>
            <strong>{latestComplianceScan ? latestComplianceScan.fileName : 'None'}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Matching rules</span>
            <strong>{latestMatches.length}</strong>
          </div>
        </div>
        <div className="compliance-rule-grid">
          {criticalRules.map(rule => (
            <article key={rule.id} className={clsx('compliance-rule-card', rule.severity)}>
              <div className="compliance-rule-top">
                <h4>{rule.title}</h4>
                <span className="status-pill">{rule.severity}</span>
              </div>
              <p>{rule.summary}</p>
              {!isDemo && <LanguageCaption text={`${rule.title}. ${rule.summary}`} />}
              <div className="compliance-doc-tags">
                {rule.requiredDocs.slice(0, 4).map(doc => <span key={doc}>{doc}</span>)}
              </div>
            </article>
          ))}
        </div>
        {shouldShowBorderChecklist && (
          <div className="cross-border-checklist">
            <div className="section-heading-row compact-row">
              <div>
                <h4>{selectedJurisdiction.code === 'EU' ? 'EU Movement Evidence' : 'Cross-Border Customs Readiness'}</h4>
                <p className="section-help">Pulled from route profiles and the latest extracted upload fields.</p>
              </div>
              <span className="status-pill">{routeProfiles.length} route profiles</span>
            </div>
            <div className="compliance-doc-tags checklist-tags">
              {customsChecklist.map(item => {
                const token = item.split(' ')[0].toLowerCase();
                const ready = checklistEvidence.includes(token);
                return <span key={item} className={clsx(ready && 'ready')}>{item}: {ready ? 'Ready' : 'Review'}</span>;
              })}
            </div>
          </div>
        )}
      </section>
    );
  };

  const renderLoads = () => (
    <section className="loads-workspace">
      <div className="section-heading-row">
        <div>
          <h2>Trip Files</h2>
          <p className="section-help">Save the order details, check if the load pays, share the trip file, and turn it into income.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => {
          setLoadForm(emptyLoadPacket());
          setEditingLoadId(null);
        }}>
          New Trip File
        </button>
      </div>

      {renderLoadCompliancePanel()}

      <form className="expense-form-section load-packet-form" onSubmit={saveLoadPacket}>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="load-number">Order number</label>
                        <input id="load-number" name="loadNumber" value={loadForm.loadNumber} onChange={handleLoadFormChange} placeholder="Order or contract number" />
          </div>
          <div className="form-group">
            <label htmlFor="load-status">Status</label>
            <select id="load-status" name="status" value={loadForm.status} onChange={handleLoadFormChange}>
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="delivered">Delivered</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="load-broker">Freight agent</label>
                        <input id="load-broker" name="broker" value={loadForm.broker} onChange={handleLoadFormChange} placeholder="Freight agent or dispatcher" />
          </div>
          <div className="form-group">
                        <label htmlFor="load-shipper">Sender</label>
                        <input id="load-shipper" name="shipper" value={loadForm.shipper} onChange={handleLoadFormChange} placeholder="Who you collect the load from" />
          </div>
          <div className="form-group">
            <label htmlFor="load-receiver">Receiver</label>
                        <input id="load-receiver" name="receiver" value={loadForm.receiver} onChange={handleLoadFormChange} placeholder="Who you deliver the load to" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="load-pickup-date">Pickup Date</label>
            <input id="load-pickup-date" type="date" name="pickupDate" value={loadForm.pickupDate} onChange={handleLoadFormChange} />
          </div>
          <div className="form-group">
            <label htmlFor="load-delivery-date">Delivery Date</label>
            <input id="load-delivery-date" type="date" name="deliveryDate" value={loadForm.deliveryDate} onChange={handleLoadFormChange} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="load-rate">Rate ({currencyCode})</label>
            <input id="load-rate" type="number" name="rate" value={loadForm.rate} onChange={handleLoadFormChange} step="0.01" min="0" />
          </div>
          <div className="form-group">
            <label htmlFor="load-loaded-miles">Loaded distance ({region.distanceUnit})</label>
            <input id="load-loaded-miles" type="number" name="loadedMiles" value={loadForm.loadedMiles} onChange={handleLoadFormChange} step="0.1" min="0" />
          </div>
          <div className="form-group">
            <label htmlFor="load-deadhead-miles">Empty-run distance ({region.distanceUnit})</label>
            <input id="load-deadhead-miles" type="number" name="deadheadMiles" value={loadForm.deadheadMiles} onChange={handleLoadFormChange} step="0.1" min="0" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="load-fuel-estimate">Fuel Estimate ({currencyCode})</label>
            <input id="load-fuel-estimate" type="number" name="fuelEstimate" value={loadForm.fuelEstimate} onChange={handleLoadFormChange} step="0.01" min="0" />
          </div>
          <div className="form-group">
            <label htmlFor="load-tolls">Tolls ({currencyCode})</label>
            <input id="load-tolls" type="number" name="tolls" value={loadForm.tolls} onChange={handleLoadFormChange} step="0.01" min="0" />
          </div>
          <div className="form-group">
            <label htmlFor="load-lumper">Loading / offloading labour ({currencyCode})</label>
            <input id="load-lumper" type="number" name="lumper" value={loadForm.lumper} onChange={handleLoadFormChange} step="0.01" min="0" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="load-pickup-address">Pickup Address</label>
            <input id="load-pickup-address" name="pickupAddress" value={loadForm.pickupAddress} onChange={handleLoadFormChange} />
          </div>
          <div className="form-group">
            <label htmlFor="load-delivery-address">Delivery Address</label>
            <input id="load-delivery-address" name="deliveryAddress" value={loadForm.deliveryAddress} onChange={handleLoadFormChange} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="load-detention-terms">Waiting-time charges</label>
                        <input id="load-detention-terms" name="detentionTerms" value={loadForm.detentionTerms} onChange={handleLoadFormChange} placeholder={`e.g. first 2 hours free, then ${currencyCode} 75 per hour`} />
          </div>
          <div className="form-group">
            <label htmlFor="load-notes">Notes / Document Links</label>
            <input id="load-notes" name="notes" value={loadForm.notes} onChange={handleLoadFormChange} placeholder="Waybill, signed delivery note, order details, extra charges" />
          </div>
        </div>

        <div className="load-score-panel">
          {(() => {
            const decision = computeLoadDecision(loadForm, effectiveTargets);
            return (
              <>
                <div>
                  <span className="metric-label">Decision</span>
                  <strong className={clsx('load-score', decision.score.toLowerCase())}>{decision.score}</strong>
                </div>
                <div>
                  <span className="metric-label">Net</span>
                  <strong>{formatMoney(decision.net)}</strong>
                </div>
                <div>
                  <span className="metric-label">Net / {region.distanceUnit}</span>
                                    <strong>{decision.netPerMile ? `${formatMoney(decision.netPerMile)}/${region.distanceUnit}` : 'Add distance'}</strong>
                </div>
              </>
            );
          })()}
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary">{editingLoadId ? 'Update Trip File' : 'Save Trip File'}</button>
          {editingLoadId && (
            <button type="button" className="btn-secondary" onClick={() => {
              setLoadForm(emptyLoadPacket());
              setEditingLoadId(null);
            }}>
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      <section className="maintenance-panel">
        <div className="section-heading-row">
          <div>
            <h2>Maintenance Automation</h2>
            <p className="section-help">Reminders trigger by odometer or date. Current odometer: {currentOdometer ? currentOdometer.toLocaleString() : 'not logged yet'}.</p>
          </div>
        </div>
        <form className="maintenance-form" onSubmit={saveMaintenanceItem}>
          <input name="name" value={maintenanceForm.name} onChange={handleMaintenanceFormChange} placeholder="Oil service, tyres, vehicle inspection" />
          <input type="number" name="dueOdometer" value={maintenanceForm.dueOdometer} onChange={handleMaintenanceFormChange} placeholder="Due odometer" />
          <input type="date" name="dueDate" value={maintenanceForm.dueDate} onChange={handleMaintenanceFormChange} />
          <button type="submit" className="btn-secondary">Save Reminder</button>
        </form>
        <div className="maintenance-list">
          {maintenanceItems.length === 0 ? (
            <p className="admin-empty">Add oil, tyres, brakes, vehicle inspection, insurance, registration or licence reminders.</p>
          ) : maintenanceItems.map(item => (
            <article key={item.id} className="maintenance-item">
              <div>
                <strong>{item.name}</strong>
                <p>{item.dueOdometer ? `Due at ${Number(item.dueOdometer).toLocaleString()} ${region.distanceUnit}` : 'No odometer due'}{item.dueDate ? ` | ${item.dueDate}` : ''}</p>
              </div>
              <button type="button" className="btn-secondary small" onClick={() => completeMaintenanceItem(item)}>Done</button>
            </article>
          ))}
        </div>
      </section>

      <div className="load-packet-grid">
        {loadPackets.length === 0 ? (
          <section className="empty-work-card">
            <h3>Create your first trip file</h3>
            <p>Record the agreed rate, pickup and delivery, fuel estimate, waybill and delivery notes, and see your profit before you accept the load.</p>
          </section>
        ) : loadPackets.map(packet => {
          const decision = computeLoadDecision(packet, effectiveTargets);
          const dispatchAlert = complianceReadinessAlerts.find(alert => ['critical', 'warning'].includes(alert.level));
          const dispatchBlocked = dispatchPolicy.blocked && packet.status !== 'delivered';
          return (
            <article key={packet.id} className="load-packet-card">
              <div className="load-card-top">
                <div>
                  <span className="status-pill">{packet.status}</span>
                  <h3>{packet.loadNumber || packet.broker || packet.shipper || 'Trip File'}</h3>
                  <p>{packet.shipper || 'Pickup'} to {packet.receiver || 'delivery'}</p>
                </div>
                <strong className={clsx('load-score', decision.score.toLowerCase())}>{decision.score}</strong>
              </div>
              <div className="fleet-driver-metrics">
                <div><span>Rate</span><strong>{formatMoney(packet.rate || 0)}</strong></div>
                <div><span>Net</span><strong>{formatMoney(decision.net)}</strong></div>
                <div><span>Net/{region.distanceUnit}</span><strong>{decision.netPerMile ? formatMoney(decision.netPerMile) : 'N/A'}</strong></div>
              </div>
              {dispatchAlert && (
                <div className={clsx('load-dispatch-alert', dispatchAlert.level)}>
                  <strong>{dispatchAlert.title}</strong>
                  <span>{selectedJurisdiction.label}</span>
                </div>
              )}
              <div className="load-card-actions">
                <button type="button" className="btn-secondary small" onClick={() => editLoadPacket(packet)}>Edit</button>
                <button type="button" className="btn-secondary small" onClick={() => logLoadPacketIncome(packet)}>Log Income</button>
                <button type="button" className="btn-secondary small" onClick={() => downloadLoadPacket(packet)}>Download</button>
                <button type="button" className="btn-secondary small" onClick={() => shareLoadPacket(packet)}>Text</button>
                {packet.status !== 'paid' && (
                  <button
                    type="button"
                    className="btn-secondary small"
                    disabled={dispatchBlocked}
                    title={dispatchBlocked ? dispatchPolicy.title : undefined}
                    onClick={() => setLoadStatus(packet.id, packet.status === 'delivered' ? 'paid' : 'delivered')}
                  >
                    {packet.status === 'delivered' ? 'Mark Paid' : 'Delivered'}
                  </button>
                )}
                <button type="button" className="btn-delete" onClick={() => deleteLoadPacket(packet.id)}>Delete</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );

  const renderLog = () => (
    <>
      <div className="log-subnav">
        {[
          { id: 'add', label: 'New Entry' },
          { id: 'history', label: 'History' },
          { id: 'receipts', label: 'Receipts' }
        ].map(view => (
          <button
            key={view.id}
            type="button"
            className={clsx('log-subnav-btn', logView === view.id && 'active')}
            onClick={() => setLogView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>
      {logView === 'add' && renderAddForm()}
      {logView === 'history' && renderHistory()}
      {logView === 'receipts' && (
        <ReceiptGallery expenses={expenses} onSelect={(expense) => handleEditExpense(expense)} formatMoney={formatMoney} />
      )}
    </>
  );

  const renderReports = () => (
    <section className="reports-section">
      <h2>{region.reportsTitle}</h2>

      <div className="report-quarter-picker">
        <label htmlFor="report-year">Year</label>
        <select id="report-year" value={reportYear} onChange={e => setReportYear(Number(e.target.value))}>
            {[reportYear - 1, reportYear, reportYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
        </select>
        <label htmlFor="report-quarter">Quarter</label>
        <select id="report-quarter" value={reportQuarter} onChange={e => setReportQuarter(Number(e.target.value))}>
            {[1, 2, 3, 4].map(q => (
              <option key={q} value={q}>Q{q}</option>
            ))}
        </select>
      </div>

      <div className="report-actions">
        <button type="button" className="btn-primary" disabled={!!exporting} onClick={() => handleExport('pdf', 'monthly')}>
          {exporting === 'pdf-monthly' ? 'Generating...' : 'Monthly PDF'}
        </button>
        <button type="button" className="btn-secondary" disabled={!!exporting} onClick={() => handleExport('pdf', 'weekly')}>
          Weekly PDF
        </button>
        <button type="button" className="btn-secondary" disabled={!!exporting} onClick={() => handleExport('csv', 'monthly')}>
          CSV (Excel / accounting)
        </button>
      </div>

      <WeeklyChart days={weeklyDays} title="Weekly Summary" formatMoney={formatMoney} />

      {taxReport && (
        <div className="report-block">
          <h3>{region.taxReportTitle} — Q{taxReport.quarter} {taxReport.year}</h3>
          <div className="metrics-grid compact">
            <div className="metric-card"><span className="metric-label">Income</span><strong>{formatMoney(taxReport.totalIncome)}</strong></div>
            <div className="metric-card"><span className="metric-label">Expenses</span><strong>{formatMoney(taxReport.totalExpenses)}</strong></div>
            <div className="metric-card highlight"><span className="metric-label">Net</span><strong>{formatMoney(taxReport.netProfit)}</strong></div>
          </div>
          <table className="report-table">
            <thead><tr><th>Category</th><th>Amount</th></tr></thead>
            <tbody>
              {(taxReport.scheduleCLines || []).map(line => (
                <tr key={line.category}><td>{line.label}</td><td>{formatMoney(line.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {iftaReport && (
        <div className="report-block">
          <h3>{region.fuelReportTitle} — Q{iftaReport.quarter} {iftaReport.year}</h3>
          <p className="section-help">Total: {iftaReport.totalGallons?.toFixed(1) || 0} {region.fuelUnitShort} · {formatMoney(iftaReport.totalCost)}</p>
          {iftaReport.states?.length > 0 ? (
            <table className="report-table">
              <thead><tr><th>{region.fuelReportLocationHeader}</th><th>{region.fuelUnit}</th><th>Cost</th><th>Stops</th></tr></thead>
              <tbody>
                {iftaReport.states.map(row => (
                  <tr key={row.state}>
                    <td>{row.state}</td>
                    <td>{row.gallons}</td>
                    <td>{formatMoney(row.cost)}</td>
                    <td>{row.stops}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="admin-empty">No fuel data for this quarter.</p>
          )}
          {iftaReport.unassigned?.stops > 0 && (
            <p className="admin-hint warn">Unassigned: {iftaReport.unassigned.gallons} {region.fuelUnitShort}</p>
          )}
        </div>
      )}

      <div className="metrics-grid compact">
        <div className="metric-card"><span className="metric-label">Profit / {region.distanceUnit}</span><strong>{formatMoney(displayMetrics.profitPerMile)}</strong></div>
        <div className="metric-card"><span className="metric-label">Fuel {currencyCode} / {region.distanceUnit}</span><strong>{formatMoney(displayMetrics.fuelCostPerMile)}</strong></div>
        <div className="metric-card"><span className="metric-label">Total {region.fuelUnit}</span><strong>{displayMetrics.totalGallons || '—'}</strong></div>
        <div className="metric-card"><span className="metric-label">Net Profit</span><strong>{formatMoney(displayMetrics.netProfit)}</strong></div>
      </div>
    </section>
  );

  const renderHos = () => (
    <section className="hos-section">
      <h2>Driving Hours</h2>
      <p className="section-help">A guide to help you rest in time. East African countries have no single national driving-hours rule, so set limits that match your company and country rules.</p>

      <div className="hos-clocks">
        <div className="metric-card highlight">
          <span className="metric-label">Driving time left</span>
          <strong>{formatHoursRemaining(hosClocks?.driveRemainingMs || 0)}</strong>
        </div>
        <div className="metric-card highlight">
          <span className="metric-label">Working time left</span>
          <strong>{formatHoursRemaining(hosClocks?.windowRemainingMs || 0)}</strong>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="driving-limit-hours">Driving limit (hours)</label>
          <input id="driving-limit-hours" type="number" min="1" max="24" step="0.5" value={drivingLimits.driveHours} onChange={(e) => updateDrivingLimit('driveHours', e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="duty-limit-hours">Working-day limit (hours)</label>
          <input id="duty-limit-hours" type="number" min="1" max="24" step="0.5" value={drivingLimits.dutyHours} onChange={(e) => updateDrivingLimit('dutyHours', e.target.value)} />
        </div>
      </div>

      <p className="hos-current">Now: <strong>{HOS_STATUSES.find(item => item.value === hosStatus)?.label || hosStatus}</strong></p>

      <div className="hos-buttons">
        {HOS_STATUSES.map(item => (
          <button
            key={item.value}
            type="button"
            className={clsx('btn-secondary', hosStatus === item.value && 'active')}
            onClick={() => handleHosChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );

  const handleReviewRegulation = async (updateId, status) => {
    try {
      await ComplianceAPI.reviewRegulationUpdate(updateId, status);
      await loadComplianceSummary();
      showToast(status === 'approved' ? 'Update approved.' : 'Update dismissed.', 'success');
    } catch (err) {
      showToast(err?.response?.data?.error || 'Could not save review.', 'error');
    }
  };

  const renderCompliance = () => (
    <section className="compliance-workspace">
      <div className="section-heading-row compliance-heading">
        <div>
          <h2>Rules and Papers by Country</h2>
          <p className="section-help">The country you choose decides which papers you need, what the upload check looks for, and which warnings you see before a trip.</p>
        </div>
        <span className="status-pill">{complianceSyncStatus === 'synced' ? 'Saved online' : 'Saved on this phone only'}</span>
        <label className="jurisdiction-picker" htmlFor="compliance-jurisdiction">Country / region</label>
        <select id="compliance-jurisdiction" value={selectedJurisdictionCode} onChange={(e) => handleJurisdictionChange(e.target.value)}>
            {COMPLIANCE_JURISDICTIONS.map(jurisdiction => (
              <option key={jurisdiction.code} value={jurisdiction.code}>{jurisdiction.label}</option>
            ))}
        </select>
      </div>

      <div className="compliance-hero-panel">
        <div>
          <span className="metric-label">{selectedJurisdiction.region}</span>
          <h3>{selectedJurisdiction.label}</h3>
          <p>{selectedJurisdiction.summary}</p>
        </div>
        <div className="compliance-authority-card">
          <span className="metric-label">Who regulates this</span>
          <strong>{selectedJurisdiction.regulator}</strong>
          <a href={selectedJurisdiction.portal} target="_blank" rel="noreferrer">Open official source</a>
        </div>
      </div>

      <div className="compliance-status-grid">
        <article className="metric-card highlight">
          <span className="metric-label">Serious Rules</span>
          <strong>{criticalComplianceCount}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Saved Uploads</span>
          <strong>{complianceScans.length}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Your Role</span>
          <strong>{fleetStatus?.hasFleet ? fleetStatus.role || 'fleet' : 'solo'}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Trip Files</span>
          <strong>{loadPackets.length}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Profiles</span>
          <strong>{complianceProfiles.length}</strong>
        </article>
        <article className={clsx('metric-card', dispatchBlockerCount && 'highlight')}>
          <span className="metric-label">Trip Warnings</span>
          <strong>{dispatchBlockerCount}</strong>
        </article>
      </div>

      <section className="compliance-panel-block fleet-readiness-panel">
        <div className="section-heading-row compact-row">
          <div>
            <h3>Ready for the Road?</h3>
            <p className="section-help">Rollup for the selected jurisdiction across uploaded findings and reusable driver, vehicle, and route profiles.</p>
          </div>
          <div className="compliance-profile-toolbar">
            <span className={clsx('status-pill', dispatchPolicy.blocked && 'danger')}>{dispatchPolicy.blocked ? 'Do not dispatch' : 'Check warnings'}</span>
            <span className="status-pill">{complianceSummary?.profileCount ?? complianceProfiles.length} profiles</span>
          </div>
        </div>
        <div className="automation-alert-list compact-row">
          {complianceReadinessAlerts.map(alert => (
            <article key={`${alert.title}-${alert.body}`} className={clsx('automation-alert', alert.level)}>
              <strong>{alert.title}</strong>
              <p>{alert.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="compliance-panel-block regulation-monitor-panel">
        <div className="section-heading-row compact-row">
          <div>
            <h3>Regulation Watch</h3>
            <p className="section-help">
              RigHand checks official sources automatically. Detected changes are flagged here for review and do not change your rules until approved.
            </p>
          </div>
          <span className="status-pill">
            {complianceSummary?.regulationMonitor?.lastCheckedAt
              ? `Checked ${new Date(complianceSummary.regulationMonitor.lastCheckedAt).toLocaleDateString('en-GB')}`
              : 'First check pending'}
          </span>
        </div>
        {(complianceSummary?.regulationMonitor?.updates || []).length === 0 ? (
          <p className="admin-empty">No regulation changes detected for {selectedJurisdiction.label}.</p>
        ) : (
          <div className="automation-alert-list compact-row">
            {complianceSummary.regulationMonitor.updates.map(update => (
              <article key={update.id} className={clsx('automation-alert', update.status === 'pending_review' ? 'warning' : 'info')}>
                <strong>{update.title}</strong>
                <p>{update.summary}</p>
                {!isDemo && <LanguageCaption text={`${update.title}. ${update.summary}`} />}
                <small>
                  {new Date(update.detectedAt).toLocaleDateString('en-GB')} · {update.status === 'pending_review' ? 'Waiting for review' : 'Approved'}
                  {update.summaryMode === 'ai' ? ' · AI summary' : ''}
                  {update.sourceUrl && (<> · <a href={update.sourceUrl} target="_blank" rel="noreferrer">Official source</a></>)}
                </small>
                {complianceSummary.regulationMonitor.canReview && update.status === 'pending_review' && (
                  <div className="trip-actions">
                    <button type="button" className="btn-primary" onClick={() => handleReviewRegulation(update.id, 'approved')}>Approve</button>
                    <button type="button" className="btn-secondary" onClick={() => handleReviewRegulation(update.id, 'dismissed')}>Dismiss</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="compliance-upload-panel">
        <div>
          <h3>Upload a Document</h3>
                    <p className="section-help">Upload a permit, inspection note, customs entry, weighbridge ticket, driving-hours record, PSV record or route document. The app reads text and PDF files for you. Photos are not read automatically yet, so check them yourself.</p>
        </div>
        <input type="file" accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,image/*" onChange={handleComplianceUpload} />
      </div>

      <section className="compliance-panel-block compliance-profile-panel">
        <div className="section-heading-row compact-row">
          <div>
            <h3>Driver, Vehicle and Route Details</h3>
                        <p className="section-help">Save details you use often for this country, so you don't have to upload a document every time.</p>
          </div>
          <div className="compliance-profile-toolbar">
                        <button type="button" className="btn-secondary small" onClick={prefillComplianceProfileFromScan}>Use Last Upload</button>
                        <span className="status-pill">Drivers {profileCounts.driver || 0} · Vehicles {profileCounts.vehicle || 0} · Routes {profileCounts.route || 0}</span>
          </div>
        </div>
        <form className="compliance-profile-form" onSubmit={saveComplianceProfile}>
          <select name="profileType" value={complianceProfileForm.profileType} onChange={handleComplianceProfileChange} aria-label="Profile type">
            <option value="driver">Driver</option>
            <option value="vehicle">Vehicle</option>
            <option value="route">Route</option>
          </select>
          <input name="title" value={complianceProfileForm.title} onChange={handleComplianceProfileChange} placeholder="Name, for example: My truck UAX 123A" />
          <input name="licenceExpiry" value={complianceProfileForm.licenceExpiry} onChange={handleComplianceProfileChange} placeholder="Licence expiry" />
          <input name="vehiclePlate" value={complianceProfileForm.vehiclePlate} onChange={handleComplianceProfileChange} placeholder="Vehicle plate" />
          <input name="inspectionExpiry" value={complianceProfileForm.inspectionExpiry} onChange={handleComplianceProfileChange} placeholder="Inspection expiry" />
          <input name="insuranceReference" value={complianceProfileForm.insuranceReference} onChange={handleComplianceProfileChange} placeholder="Insurance policy / insurer" />
          <input name="comesaYellowCard" value={complianceProfileForm.comesaYellowCard} onChange={handleComplianceProfileChange} placeholder="COMESA Yellow Card / digital ref" />
          <input name="axleLoadReference" value={complianceProfileForm.axleLoadReference} onChange={handleComplianceProfileChange} placeholder="Verified axle/load source + date" />
          <input name="routeCountries" value={complianceProfileForm.routeCountries} onChange={handleComplianceProfileChange} placeholder="Countries / corridor" />
          <input name="borderPosts" value={complianceProfileForm.borderPosts} onChange={handleComplianceProfileChange} placeholder="Border posts" />
          <input name="notes" value={complianceProfileForm.notes} onChange={handleComplianceProfileChange} placeholder="Notes" />
          <button type="submit" className="btn-primary">Save Profile</button>
        </form>
        {complianceProfiles.length > 0 && (
          <div className="compliance-profile-grid">
            {complianceProfiles.slice(0, 6).map(profile => (
              <article key={profile.id} className="compliance-profile-card">
                <div className="compliance-rule-top">
                  <h4>{profile.title}</h4>
                  <span className="status-pill">{profile.profileType}</span>
                </div>
                <div className="compliance-doc-tags">
                  {Object.entries(profile.data || {}).filter(([, value]) => value).slice(0, 5).map(([key, value]) => (
                    <span key={key}>{key.replace(/([A-Z])/g, ' $1')}: {value}</span>
                  ))}
                </div>
                <div className="compliance-profile-actions">
                  <button type="button" className="btn-secondary small" onClick={() => deleteComplianceProfile(profile.id)}>Remove</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {latestComplianceScan && (
        <section className="compliance-findings-panel">
          <div className="section-heading-row compact-row">
            <div>
              <h3>{latestComplianceScan.fileName}</h3>
              <p className="section-help">{latestComplianceScan.directHit ? 'Matched against regional compliance topics.' : 'No strong keyword match, so core checklist is shown.'}</p>
            </div>
            <span className="status-pill">{latestComplianceScan.jurisdictionLabel}</span>
          </div>
          {latestExtractedFields.length > 0 && (
            <div className="compliance-extracted-fields">
              {latestExtractedFields.map(([field, values]) => (
                <article key={field}>
                  <span className="metric-label">{field.replace(/([A-Z])/g, ' $1')}</span>
                  <strong>{Array.isArray(values) ? values.slice(0, 4).join(', ') : String(values)}</strong>
                </article>
              ))}
            </div>
          )}
          {latestComplianceScan.reviewAlerts?.length > 0 && (
            <div className="automation-alert-list compact-row">
              {latestComplianceScan.reviewAlerts.map(alert => (
                <article key={`${alert.title}-${alert.body}`} className={clsx('automation-alert', alert.level)}>
                  <strong>{alert.title}</strong>
                  <p>{alert.body}</p>
                </article>
              ))}
            </div>
          )}
          <div className="compliance-rule-grid">
            {latestComplianceScan.matches.map(rule => (
              <article key={rule.id} className={clsx('compliance-rule-card', rule.severity)}>
                <div className="compliance-rule-top">
                  <h4>{rule.title}</h4>
                  <span className="badge">{rule.hits.length ? `${rule.hits.length} hits` : rule.severity}</span>
                </div>
                <p>{rule.summary}</p>
                {!isDemo && <LanguageCaption text={`${rule.title}. ${rule.summary}`} />}
                <div className="compliance-doc-tags">
                  {rule.requiredDocs.slice(0, 5).map(doc => <span key={doc}>{doc}</span>)}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="compliance-layout-grid">
        <section className="compliance-panel-block">
          <h3>Steps Before You Leave</h3>
          <div className="automation-alert-list">
            {selectedJurisdiction.workflowPrompts.map((prompt, index) => (
              <article key={prompt} className="automation-alert warning">
                <strong>Step {index + 1}</strong>
                <p>{prompt}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="compliance-panel-block">
          <h3>Rules</h3>
          <div className="compliance-rule-list">
            {selectedJurisdiction.rules.map(rule => (
              <article key={rule.id} className={clsx('compliance-rule-card', rule.severity)}>
                <div className="compliance-rule-top">
                  <div>
                    <span className="metric-label">{rule.group}</span>
                    <h4>{rule.title}</h4>
                  </div>
                  <span className="status-pill">{rule.severity}</span>
                </div>
                <p>{rule.summary}</p>
                {!isDemo && <LanguageCaption text={`${rule.title}. ${rule.summary}`} />}
                <div className="compliance-doc-tags">
                  {rule.requiredDocs.map(doc => <span key={doc}>{doc}</span>)}
                </div>
                <div className="compliance-sources">
                  {rule.sources.map(item => (
                    <a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.label}</a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <p className="admin-hint warn">This is a guide, not legal advice. Please confirm important decisions with the official office.</p>
    </section>
  );

  return (
    <div className={clsx('dashboard', `theme-${theme}`, isNight && 'night-drive')}>
      <div className="console-screensaver" aria-hidden="true">
        <img src={`${process.env.PUBLIC_URL}/truck-console-bg.png`} alt="" className="console-truck-art" />
        <div className="console-screensaver-glow" />
      </div>

      <header className={clsx('dashboard-header', isNight && 'night-drive')}>
        <div className="header-top">
          <div className="header-brand">
            <h1>RigHand Operations</h1>
            <p className="user-info">{user?.name || user?.email || 'Driver'}</p>
          </div>
          <div className="header-actions">
            <span className={`sync-status ${syncStatus}`}>{syncStatus}</span>
            <button type="button" onClick={onLogout} className="btn-logout">Logout</button>
          </div>
        </div>

        <nav className="header-nav" aria-label="Main navigation">
          {[
            { id: 'home', label: 'Home', icon: 'H', pro: false },
            { id: 'loads', label: 'Loads', icon: 'L', pro: false },
            { id: 'log', label: 'Money Log', icon: 'M', pro: false },
            { id: 'reports', label: 'Tax & Fuel', icon: 'R', pro: true },
            { id: 'compliance', label: 'Compliance', icon: 'C', pro: false },
            { id: 'hos', label: 'Driving Hours', icon: '⏱', pro: true },
            { id: 'fleet', label: 'Dispatch', icon: 'D', pro: false },
            { id: 'admin', label: 'Admin', icon: '⚙', pro: true }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              className={clsx('header-nav-item', activeTab === tab.id && 'active', tab.pro && !isPro && 'locked')}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="header-nav-icon" aria-hidden="true">{tab.icon}</span>
              <span className="header-nav-label">
                {tab.label}
                {tab.pro && !isPro && <span className="nav-lock" aria-label="Pro feature"> 🔒</span>}
              </span>
            </button>
          ))}
        </nav>
      </header>

      <main className="dashboard-main">
        {toast.message && (
          <output className={`toast-banner ${toast.type}`}>{toast.message}</output>
        )}
        {subscription?.trialActive && (
          <div className="trial-banner">
            Free trial — {subscription.trialDaysLeft} day{subscription.trialDaysLeft !== 1 ? 's' : ''} remaining.
            Subscribe to keep access after your trial ends.
          </div>
        )}

        {activeTab === 'home' && renderHome()}
        {activeTab === 'loads' && renderLoads()}
        {activeTab === 'log' && renderLog()}
        {activeTab === 'reports' && (
          <UpgradeGate tier="pro" subscription={subscription} onUnlocked={handlePaidUnlock}>
            {renderReports()}
          </UpgradeGate>
        )}
        {activeTab === 'compliance' && renderCompliance()}
        {activeTab === 'hos' && (
          <UpgradeGate tier="pro" subscription={subscription} onUnlocked={handlePaidUnlock}>
            {renderHos()}
          </UpgradeGate>
        )}
        {activeTab === 'fleet' && (
          <FleetDashboard
            fleetStatus={fleetStatus}
            isDemo={isDemo}
            userId={userId}
            subscription={subscription}
            onUnlocked={handlePaidUnlock}
            formatMoney={formatMoney}
            onFleetChanged={loadFleetStatus}
          />
        )}
        {activeTab === 'admin' && (
          <UpgradeGate tier="pro" subscription={subscription} onUnlocked={handlePaidUnlock}>
            <AdminPanel
            expenses={adminExpenses}
            openingIncome={openingIncome}
            onSaveOpeningIncome={saveOpeningIncome}
            onEdit={handleEditExpense}
            onDelete={handleDeleteExpense}
            onAddIncome={() => startQuickEntry('income')}
            onAddExpense={() => startQuickEntry('expense')}
            onReload={loadExpenses}
            formatMoney={formatMoney}
          />
          </UpgradeGate>
        )}
      </main>
    </div>
  );
};

export default Dashboard;

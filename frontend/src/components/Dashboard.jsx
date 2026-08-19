import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import clsx from 'clsx';
import { ComplianceAPI, ExpenseAPI, ReportsAPI, FleetAPI, CategoriesAPI, OpsAPI, SyncManager } from '../services/api';
import {
  EMPTY_FORM,
  computeLocalMetrics,
  computeLoadProfitPreview,
  computeHosClocks,
  computeFuelMpg,
  computeWeeklyFromExpenses,
  findPreviousFuelOdometer,
  formatHoursRemaining,
  downloadBlob,
  readFileAsDataUrl
} from '../utils/proMetrics';
import { US_STATES } from '../utils/usStates';
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
  { value: 'OFF_DUTY', label: 'Off Duty' },
  { value: 'SLEEPER', label: 'Sleeper' },
  { value: 'DRIVING', label: 'Driving' },
  { value: 'ON_DUTY', label: 'On Duty (Not Driving)' }
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

const formatMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `$${Number(value).toFixed(2)}`;
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
    routeCountries: '',
    borderPosts: '',
    notes: ''
  });
  const [complianceSummary, setComplianceSummary] = useState(null);
  const [complianceSyncStatus, setComplianceSyncStatus] = useState('local');
  const { subscription, isPro, refresh: refreshSubscription } = useSubscription(isDemo);

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
        title: 'Profile coverage incomplete',
        body: `Add ${missingProfiles.join(', ')} compliance profile records before dispatch review.`
      });
    }
    if (latestComplianceScan?.reviewAlerts?.some(alert => alert.level === 'critical')) {
      alerts.push({
        level: 'critical',
        title: 'Critical compliance findings open',
        body: 'Review critical uploaded-document findings before releasing a load packet.'
      });
    }
    if (alerts.length) return alerts;
    return [{
      level: 'info',
      title: 'Dispatch profile baseline ready',
      body: 'Driver, vehicle, and route profile records are available for the selected jurisdiction.'
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
        title: 'Dispatch blocked by critical compliance findings',
        reasons: ['Resolve critical uploaded-document findings before releasing this load.']
      };
    }
    return {
      mode: 'warn',
      blocked: false,
      title: 'Dispatch allowed with compliance review',
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
    netProfit: profit.netProfit
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

  const driverAlerts = useMemo(() => analyzeDriverOps({
    expenses,
    loadPackets,
    maintenanceItems,
    targets: driverTargets,
    weeklyDays
  }), [expenses, loadPackets, maintenanceItems, driverTargets, weeklyDays]);

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
    if (estimatedFuelRange) return `${estimatedFuelRange.toFixed(0)} mi range`;
    if (displayMetrics.costPerGallon) return `${formatMoney(displayMetrics.costPerGallon)}/gal`;
    return 'Add fuel stop';
  }, [displayMetrics.costPerGallon, estimatedFuelRange]);

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
      setHosClocks(computeHosClocks(hosStartedAt, drivingStartedAt, hosStatus));
    }, 30000);
    setHosClocks(computeHosClocks(hosStartedAt, drivingStartedAt, hosStatus));
    return () => clearInterval(tick);
  }, [hosStartedAt, drivingStartedAt, hosStatus]);

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
    const amountMatch = text.match(/(\d+(\.\d{1,2})?)/);
    const parsedAmount = amountMatch ? amountMatch[1] : '';
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
    const cleanedDescription = spokenText.replace(/\$?\d+(\.\d{1,2})?/g, '').replace(/\s+/g, ' ').trim();

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

  const {
    voiceAvailable,
    voiceHint,
    isListening,
    startVoiceCapture,
    stopVoiceCapture,
    toggleVoiceCapture,
  } = useVoiceCapture(applyVoiceCommand);

  const beginVoiceCapture = (e) => {
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
    showToast(`Trip miles (${miles} mi) ready to log.`, 'success');
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
        ? await ReportsAPI.downloadPdf(period)
        : await ReportsAPI.downloadCsv(period);
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
      showToast('Add a broker, shipper, or load number first.', 'error');
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
        showToast('Saved locally. Load packet will stay on this device until sync returns.', 'warning');
      }
    }
    setLoadPackets(prev => [
      savedPacket,
      ...prev.filter(item => item.id !== savedPacket.id)
    ]);
    setLoadForm(emptyLoadPacket());
    setEditingLoadId(null);
    showToast('Load packet saved.', 'success');
  };

  const editLoadPacket = (packet) => {
    setLoadForm(packet);
    setEditingLoadId(packet.id);
    setActiveTab('loads');
  };

  const deleteLoadPacket = async (packetId) => {
    if (!window.confirm('Delete this load packet?')) return;
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
    showToast('Load packet deleted.', 'success');
  };

  const setLoadStatus = async (packetId, status) => {
    const current = loadPackets.find(packet => packet.id === packetId);
    if (!current) return;
    if (status === 'delivered' && dispatchPolicy.blocked) {
      showToast(dispatchPolicy.title || 'Dispatch blocked by compliance policy.', 'error');
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
      description: packet.loadNumber ? `Load ${packet.loadNumber}` : `Load payment - ${packet.broker || packet.shipper || 'broker'}`,
      amount: packet.rate ? String(packet.rate) : '',
      miles: packet.loadedMiles ? String(packet.loadedMiles) : '',
      deadheadMiles: packet.deadheadMiles ? String(packet.deadheadMiles) : '',
      tollsAmount: packet.tolls ? String(packet.tolls) : '',
      fuelCostAlloc: packet.fuelEstimate ? String(packet.fuelEstimate) : '',
      broker: packet.broker || '',
      customer: packet.shipper || '',
      notes: [
        packet.receiver ? `Receiver: ${packet.receiver}` : '',
        packet.detentionTerms ? `Detention: ${packet.detentionTerms}` : '',
        packet.notes || ''
      ].filter(Boolean).join(' | ')
    });
    setActiveTab('log');
    setLogView('add');
    showToast('Load packet ready to save as income.', 'success');
  };

  const buildLoadPacketText = (packet) => {
    const decision = computeLoadDecision(packet, driverTargets);
    const netPerMileText = decision.netPerMile ? `${formatMoney(decision.netPerMile)}/mi` : 'missing miles';
    return [
      'RigHand Load Packet',
      packet.loadNumber ? `Load: ${packet.loadNumber}` : '',
      packet.broker ? `Broker: ${packet.broker}` : '',
      packet.shipper ? `Pickup: ${packet.shipper} ${packet.pickupDate || ''}` : '',
      packet.receiver ? `Delivery: ${packet.receiver} ${packet.deliveryDate || ''}` : '',
      packet.pickupAddress ? `Pickup address: ${packet.pickupAddress}` : '',
      packet.deliveryAddress ? `Delivery address: ${packet.deliveryAddress}` : '',
      `Rate: ${formatMoney(packet.rate || 0)}`,
      `Miles: ${decision.totalMiles || 0}`,
      `Net: ${formatMoney(decision.net)} (${netPerMileText})`,
      packet.detentionTerms ? `Detention: ${packet.detentionTerms}` : '',
      packet.notes ? `Notes: ${packet.notes}` : ''
    ].filter(Boolean).join('\n');
  };

  const downloadLoadPacket = (packet) => {
    const blob = new Blob([buildLoadPacketText(packet)], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `righand-load-${packet.loadNumber || packet.id}.txt`);
    showToast('Load packet downloaded.', 'success');
  };

  const shareLoadPacket = (packet) => {
    const text = buildLoadPacketText(packet);
    if (navigator.share) {
      navigator.share({ title: 'RigHand Load Packet', text }).catch(() => {});
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
      showToast('Could not update HOS status.', 'error');
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
        <button type="button" className="btn-secondary" onClick={() => setActiveTab('loads')}>+ Load Packet</button>
      </div>

      <section className="cockpit-grid">
        <article className="cockpit-card primary">
          <span className="metric-label">Today</span>
          <strong>{activeLoadPacket ? (activeLoadPacket.loadNumber || activeLoadPacket.broker || activeLoadPacket.shipper) : 'No active load'}</strong>
          <p>{activeLoadPacket ? `${activeLoadPacket.shipper || 'Pickup'} to ${activeLoadPacket.receiver || 'delivery'}` : 'Create your first load packet to track rate, documents, and delivery.'}</p>
          <button type="button" className="link-btn" onClick={() => setActiveTab('loads')}>
            {activeLoadPacket ? 'Open load packet' : 'Create load packet'}
          </button>
        </article>
        <article className="cockpit-card">
          <span className="metric-label">Fuel Watch</span>
          <strong>{fuelWatchText}</strong>
          <p>{displayMetrics.fuelCostPerMile ? `${formatMoney(displayMetrics.fuelCostPerMile)}/mile fuel cost` : 'Gallons, odometer, and state unlock MPG and IFTA checks.'}</p>
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
              placeholder="Tank gal"
              aria-label="Tank gallons"
            />
          </div>
        </article>
        <article className="cockpit-card">
          <span className="metric-label">Next Maintenance</span>
          <strong>{nextMaintenance ? nextMaintenance.name : 'No reminders'}</strong>
          <p>{nextMaintenance?.dueOdometer ? `Due at ${Number(nextMaintenance.dueOdometer).toLocaleString()} mi` : 'Add oil, tires, DOT, insurance, or registration reminders.'}</p>
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
            <h2>Quiet Watch</h2>
            <p className="section-help">RigHand watches fuel, IFTA, maintenance, loads, and profit targets while you drive.</p>
          </div>
          <button type="button" className="link-btn" onClick={() => setActiveTab('loads')}>Manage</button>
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
            <p className="hero-opening">Includes ${openingIncome.toFixed(2)} starting income</p>
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
          <span className="metric-label">Profit / Mile</span>
          <strong>{formatMoney(displayMetrics.profitPerMile)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Fuel $ / Mile</span>
          <strong>{formatMoney(displayMetrics.fuelCostPerMile)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">$/Gallon</span>
          <strong>{formatMoney(displayMetrics.costPerGallon)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Loaded Miles</span>
          <strong>{displayMetrics.loadedMiles ? displayMetrics.loadedMiles.toFixed(1) : '—'}</strong>
        </div>
      </section>

      <WeeklyChart days={weeklyDays} title="This Week" />

      <section className="feature-banner theme-banner compact-banner">
        <strong>Theme</strong>
        <ThemeSwitcher theme={theme} setTheme={setTheme} />
      </section>

      <section className="insight-strip">
        <div className="insight-pill"><span className="insight-label">Pending Sync</span><strong>{pendingCount}</strong></div>
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
                onPointerLeave={stopVoiceCapture}
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
            <label htmlFor="expense-amount">Amount ($)</label>
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
            <label htmlFor="expense-miles">Miles {showLoadFields ? '(loaded)' : '(optional)'}</label>
            <input id="expense-miles" type="number" name="miles" value={formData.miles} onChange={handleFormChange} step="0.1" min="0" placeholder="Trip or loaded miles" />
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
                <label htmlFor="expense-gallons">Gallons (fuel log)</label>
                <input id="expense-gallons" type="number" name="gallons" value={formData.gallons} onChange={handleFormChange} step="0.01" min="0" placeholder="IRS fuel record" />
              </div>
              <div className="form-group">
                <label htmlFor="expense-fuel-state">Fuel State (IFTA)</label>
                <select id="expense-fuel-state" name="fuelState" value={formData.fuelState} onChange={handleFormChange}>
                  <option value="">Select state</option>
                  {US_STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group fuel-calc-preview">
                <span className="form-label">$/Gallon</span>
                <p>
                  {formData.gallons && formData.amount
                    ? formatMoney(Number.parseFloat(formData.amount) / Number.parseFloat(formData.gallons))
                    : '—'}
                </p>
              </div>
              <div className="form-group fuel-calc-preview">
                <span className="form-label">MPG (auto-calc)</span>
                <p>{fuelMpgPreview ? `${fuelMpgPreview.toFixed(1)} mpg` : 'Add gallons + miles or odometer'}</p>
                {prevFuelOdometer ? <small>Prev odometer: {prevFuelOdometer}</small> : null}
              </div>
            </div>
          </>
        )}

        {showLoadFields && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expense-broker">Broker</label>
                <input id="expense-broker" type="text" name="broker" value={formData.broker} onChange={handleFormChange} placeholder="e.g. TQL, CH Robinson" />
              </div>
              <div className="form-group">
                <label htmlFor="expense-customer">Customer / Shipper</label>
                <input id="expense-customer" type="text" name="customer" value={formData.customer} onChange={handleFormChange} placeholder="Who you hauled for" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expense-deadhead-miles">Deadhead Miles</label>
                <input id="expense-deadhead-miles" type="number" name="deadheadMiles" value={formData.deadheadMiles} onChange={handleFormChange} step="0.1" min="0" />
              </div>
              <div className="form-group">
                <label htmlFor="expense-tolls">Tolls ($)</label>
                <input id="expense-tolls" type="number" name="tollsAmount" value={formData.tollsAmount} onChange={handleFormChange} step="0.01" min="0" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expense-fuel-cost-alloc">Fuel Cost for Load ($)</label>
                <input id="expense-fuel-cost-alloc" type="number" name="fuelCostAlloc" value={formData.fuelCostAlloc} onChange={handleFormChange} step="0.01" min="0" />
              </div>
              <div className="form-group load-calc-preview">
                <span className="form-label">Load Net Profit</span>
                <p>{formatMoney(loadPreview.netLoadProfit)}</p>
                <small>{loadPreview.profitPerMile ? `${formatMoney(loadPreview.profitPerMile)}/mi` : 'Add loaded miles'}</small>
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
                    {new Date(expense.date).toLocaleDateString()} · {getCatLabel(expense.category)}
                  </p>
                </div>
                <p className={clsx('expense-card-amount', expense.type === 'income' ? 'income-amount' : 'expense-amount')}>
                  {expense.type === 'income' ? '+' : '-'}{formatMoney(Math.abs(expense.amount))}
                </p>
              </div>
              <div className="expense-card-tags">
                {expense.miles ? <span className="badge">{expense.miles} mi</span> : null}
                {expense.gallons ? <span className="badge">{expense.gallons} gal</span> : null}
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
      : ['Customs declaration', 'Cargo manifest', 'Bond or transit reference', 'Seal number', 'Border crossing record', 'Weighbridge or special-load evidence'];
    const checklistEvidence = `${routeText} ${(extractedFields.permitIds || []).join(' ')} ${(extractedFields.sealNumbers || []).join(' ')} ${(extractedFields.borderPosts || []).join(' ')}`.toLowerCase();
    return (
      <section className="compliance-panel-block load-compliance-panel">
        <div className="section-heading-row">
          <div>
            <span className="metric-label">Trip Compliance</span>
            <h3>{selectedJurisdiction.label} readiness</h3>
            <p className="section-help">These prompts follow the selected country or region and should be checked before dispatching a load.</p>
          </div>
          <button type="button" className="link-btn" onClick={() => setActiveTab('compliance')}>Upload evidence</button>
        </div>
        <div className="compliance-status-grid">
          <div className="metric-card">
            <span className="metric-label">Critical rules</span>
            <strong>{criticalRules.length}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Latest evidence</span>
            <strong>{latestComplianceScan ? latestComplianceScan.fileName : 'None'}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Matched topics</span>
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
          <h2>Load Packets</h2>
          <p className="section-help">Store contract details, score the load, export a trip packet, and convert it into income.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => {
          setLoadForm(emptyLoadPacket());
          setEditingLoadId(null);
        }}>
          New Packet
        </button>
      </div>

      {renderLoadCompliancePanel()}

      <form className="expense-form-section load-packet-form" onSubmit={saveLoadPacket}>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="load-number">Load #</label>
            <input id="load-number" name="loadNumber" value={loadForm.loadNumber} onChange={handleLoadFormChange} placeholder="Broker / rate con #" />
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
            <label htmlFor="load-broker">Broker</label>
            <input id="load-broker" name="broker" value={loadForm.broker} onChange={handleLoadFormChange} placeholder="Broker / dispatcher" />
          </div>
          <div className="form-group">
            <label htmlFor="load-shipper">Shipper</label>
            <input id="load-shipper" name="shipper" value={loadForm.shipper} onChange={handleLoadFormChange} placeholder="Pickup customer" />
          </div>
          <div className="form-group">
            <label htmlFor="load-receiver">Receiver</label>
            <input id="load-receiver" name="receiver" value={loadForm.receiver} onChange={handleLoadFormChange} placeholder="Delivery customer" />
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
            <label htmlFor="load-rate">Rate ($)</label>
            <input id="load-rate" type="number" name="rate" value={loadForm.rate} onChange={handleLoadFormChange} step="0.01" min="0" />
          </div>
          <div className="form-group">
            <label htmlFor="load-loaded-miles">Loaded Miles</label>
            <input id="load-loaded-miles" type="number" name="loadedMiles" value={loadForm.loadedMiles} onChange={handleLoadFormChange} step="0.1" min="0" />
          </div>
          <div className="form-group">
            <label htmlFor="load-deadhead-miles">Deadhead Miles</label>
            <input id="load-deadhead-miles" type="number" name="deadheadMiles" value={loadForm.deadheadMiles} onChange={handleLoadFormChange} step="0.1" min="0" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="load-fuel-estimate">Fuel Estimate ($)</label>
            <input id="load-fuel-estimate" type="number" name="fuelEstimate" value={loadForm.fuelEstimate} onChange={handleLoadFormChange} step="0.01" min="0" />
          </div>
          <div className="form-group">
            <label htmlFor="load-tolls">Tolls ($)</label>
            <input id="load-tolls" type="number" name="tolls" value={loadForm.tolls} onChange={handleLoadFormChange} step="0.01" min="0" />
          </div>
          <div className="form-group">
            <label htmlFor="load-lumper">Lumper ($)</label>
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
            <label htmlFor="load-detention-terms">Detention Terms</label>
            <input id="load-detention-terms" name="detentionTerms" value={loadForm.detentionTerms} onChange={handleLoadFormChange} placeholder="e.g. 2 hrs free, $75/hr" />
          </div>
          <div className="form-group">
            <label htmlFor="load-notes">Notes / Document Links</label>
            <input id="load-notes" name="notes" value={loadForm.notes} onChange={handleLoadFormChange} placeholder="BOL, POD, rate con, accessorial notes" />
          </div>
        </div>

        <div className="load-score-panel">
          {(() => {
            const decision = computeLoadDecision(loadForm, driverTargets);
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
                  <span className="metric-label">Net / Mile</span>
                  <strong>{decision.netPerMile ? `${formatMoney(decision.netPerMile)}/mi` : 'Add miles'}</strong>
                </div>
              </>
            );
          })()}
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary">{editingLoadId ? 'Update Packet' : 'Save Packet'}</button>
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
          <input name="name" value={maintenanceForm.name} onChange={handleMaintenanceFormChange} placeholder="Oil service, tires, DOT inspection" />
          <input type="number" name="dueOdometer" value={maintenanceForm.dueOdometer} onChange={handleMaintenanceFormChange} placeholder="Due odometer" />
          <input type="date" name="dueDate" value={maintenanceForm.dueDate} onChange={handleMaintenanceFormChange} />
          <button type="submit" className="btn-secondary">Save Reminder</button>
        </form>
        <div className="maintenance-list">
          {maintenanceItems.length === 0 ? (
            <p className="admin-empty">Add oil, tires, brakes, DOT, insurance, registration, or license reminders.</p>
          ) : maintenanceItems.map(item => (
            <article key={item.id} className="maintenance-item">
              <div>
                <strong>{item.name}</strong>
                <p>{item.dueOdometer ? `Due at ${Number(item.dueOdometer).toLocaleString()} mi` : 'No odometer due'}{item.dueDate ? ` | ${item.dueDate}` : ''}</p>
              </div>
              <button type="button" className="btn-secondary small" onClick={() => completeMaintenanceItem(item)}>Done</button>
            </article>
          ))}
        </div>
      </section>

      <div className="load-packet-grid">
        {loadPackets.length === 0 ? (
          <section className="empty-work-card">
            <h3>Create your first load packet</h3>
            <p>Capture rate con details, pickup and delivery, fuel estimate, BOL/POD notes, and profit before accepting the load.</p>
          </section>
        ) : loadPackets.map(packet => {
          const decision = computeLoadDecision(packet, driverTargets);
          const dispatchAlert = complianceReadinessAlerts.find(alert => ['critical', 'warning'].includes(alert.level));
          const dispatchBlocked = dispatchPolicy.blocked && packet.status !== 'delivered';
          return (
            <article key={packet.id} className="load-packet-card">
              <div className="load-card-top">
                <div>
                  <span className="status-pill">{packet.status}</span>
                  <h3>{packet.loadNumber || packet.broker || packet.shipper || 'Load Packet'}</h3>
                  <p>{packet.shipper || 'Pickup'} to {packet.receiver || 'delivery'}</p>
                </div>
                <strong className={clsx('load-score', decision.score.toLowerCase())}>{decision.score}</strong>
              </div>
              <div className="fleet-driver-metrics">
                <div><span>Rate</span><strong>{formatMoney(packet.rate || 0)}</strong></div>
                <div><span>Net</span><strong>{formatMoney(decision.net)}</strong></div>
                <div><span>Net/mi</span><strong>{decision.netPerMile ? formatMoney(decision.netPerMile) : 'N/A'}</strong></div>
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
        <ReceiptGallery expenses={expenses} onSelect={(expense) => handleEditExpense(expense)} />
      )}
    </>
  );

  const renderReports = () => (
    <section className="reports-section">
      <h2>Tax & IFTA</h2>

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
          CSV (QuickBooks)
        </button>
      </div>

      <WeeklyChart days={weeklyDays} title="Weekly Summary" />

      {taxReport && (
        <div className="report-block">
          <h3>Schedule C — Q{taxReport.quarter} {taxReport.year}</h3>
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
          <h3>IFTA Fuel — Q{iftaReport.quarter} {iftaReport.year}</h3>
          <p className="section-help">Total: {iftaReport.totalGallons?.toFixed(1) || 0} gal · {formatMoney(iftaReport.totalCost)}</p>
          {iftaReport.states?.length > 0 ? (
            <table className="report-table">
              <thead><tr><th>State</th><th>Gallons</th><th>Cost</th><th>Stops</th></tr></thead>
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
            <p className="admin-hint warn">Unassigned: {iftaReport.unassigned.gallons} gal</p>
          )}
        </div>
      )}

      <div className="metrics-grid compact">
        <div className="metric-card"><span className="metric-label">Profit / Mile</span><strong>{formatMoney(displayMetrics.profitPerMile)}</strong></div>
        <div className="metric-card"><span className="metric-label">Fuel $ / Mile</span><strong>{formatMoney(displayMetrics.fuelCostPerMile)}</strong></div>
        <div className="metric-card"><span className="metric-label">Total Gallons</span><strong>{displayMetrics.totalGallons || '—'}</strong></div>
        <div className="metric-card"><span className="metric-label">Net Profit</span><strong>{formatMoney(displayMetrics.netProfit)}</strong></div>
      </div>
    </section>
  );

  const renderHos = () => (
    <section className="hos-section">
      <h2>HOS Clocks</h2>

      <div className="hos-clocks">
        <div className="metric-card highlight">
          <span className="metric-label">11-hr Drive Left</span>
          <strong>{formatHoursRemaining(hosClocks?.driveRemainingMs || 0)}</strong>
        </div>
        <div className="metric-card highlight">
          <span className="metric-label">14-hr Window Left</span>
          <strong>{formatHoursRemaining(hosClocks?.windowRemainingMs || 0)}</strong>
        </div>
      </div>

      <p className="hos-current">Current: <strong>{hosStatus.replace('_', ' ')}</strong></p>

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

  const renderCompliance = () => (
    <section className="compliance-workspace">
      <div className="section-heading-row compliance-heading">
        <div>
          <h2>Regional Compliance</h2>
          <p className="section-help">Selected regulations shape required documents, upload matching, route prompts, and driver or vehicle readiness checks.</p>
        </div>
        <span className="status-pill">{complianceSyncStatus === 'synced' ? 'Server synced' : 'Local mode'}</span>
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
          <span className="metric-label">Authority map</span>
          <strong>{selectedJurisdiction.regulator}</strong>
          <a href={selectedJurisdiction.portal} target="_blank" rel="noreferrer">Open official source</a>
        </div>
      </div>

      <div className="compliance-status-grid">
        <article className="metric-card highlight">
          <span className="metric-label">Critical Checks</span>
          <strong>{criticalComplianceCount}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Saved Scans</span>
          <strong>{complianceScans.length}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Fleet Context</span>
          <strong>{fleetStatus?.hasFleet ? fleetStatus.role || 'fleet' : 'solo'}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Load Packets</span>
          <strong>{loadPackets.length}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Profiles</span>
          <strong>{complianceProfiles.length}</strong>
        </article>
        <article className={clsx('metric-card', dispatchBlockerCount && 'highlight')}>
          <span className="metric-label">Dispatch Alerts</span>
          <strong>{dispatchBlockerCount}</strong>
        </article>
      </div>

      <section className="compliance-panel-block fleet-readiness-panel">
        <div className="section-heading-row compact-row">
          <div>
            <h3>Fleet Dispatch Readiness</h3>
            <p className="section-help">Rollup for the selected jurisdiction across uploaded findings and reusable driver, vehicle, and route profiles.</p>
          </div>
          <div className="compliance-profile-toolbar">
            <span className={clsx('status-pill', dispatchPolicy.blocked && 'danger')}>{dispatchPolicy.blocked ? 'Dispatch blocked' : 'Dispatch review'}</span>
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

      <div className="compliance-upload-panel">
        <div>
          <h3>Document Intake</h3>
          <p className="section-help">Upload permits, inspection notes, customs entries, weighbridge tickets, tachograph summaries, PSV records, or route documents. Live accounts extract text/PDF content on the backend; image OCR is marked for review until OCR is connected.</p>
        </div>
        <input type="file" accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,image/*" onChange={handleComplianceUpload} />
      </div>

      <section className="compliance-panel-block compliance-profile-panel">
        <div className="section-heading-row compact-row">
          <div>
            <h3>Driver, Vehicle, Route Profiles</h3>
            <p className="section-help">Save reusable readiness facts for the selected region so dispatch checks are not tied to a single upload.</p>
          </div>
          <div className="compliance-profile-toolbar">
            <button type="button" className="btn-secondary small" onClick={prefillComplianceProfileFromScan}>Use Latest Scan</button>
            <span className="status-pill">D {profileCounts.driver || 0} / V {profileCounts.vehicle || 0} / R {profileCounts.route || 0}</span>
          </div>
        </div>
        <form className="compliance-profile-form" onSubmit={saveComplianceProfile}>
          <select name="profileType" value={complianceProfileForm.profileType} onChange={handleComplianceProfileChange} aria-label="Profile type">
            <option value="driver">Driver</option>
            <option value="vehicle">Vehicle</option>
            <option value="route">Route</option>
          </select>
          <input name="title" value={complianceProfileForm.title} onChange={handleComplianceProfileChange} placeholder="Profile title" />
          <input name="licenceExpiry" value={complianceProfileForm.licenceExpiry} onChange={handleComplianceProfileChange} placeholder="Licence expiry" />
          <input name="vehiclePlate" value={complianceProfileForm.vehiclePlate} onChange={handleComplianceProfileChange} placeholder="Vehicle plate" />
          <input name="inspectionExpiry" value={complianceProfileForm.inspectionExpiry} onChange={handleComplianceProfileChange} placeholder="Inspection expiry" />
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
          <h3>Workflow Prompts</h3>
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
          <h3>Rule Pack</h3>
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

      <p className="admin-hint warn">Operational reference only. Verify legal decisions against official sources and current local counsel guidance.</p>
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
            { id: 'log', label: 'Money Log', icon: '$', pro: false },
            { id: 'reports', label: 'Tax & IFTA', icon: 'R', pro: true },
            { id: 'compliance', label: 'Compliance', icon: 'C', pro: false },
            { id: 'hos', label: 'HOS', icon: '⏱', pro: true },
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
          />
          </UpgradeGate>
        )}
      </main>
    </div>
  );
};

export default Dashboard;

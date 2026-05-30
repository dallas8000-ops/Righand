import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import clsx from 'clsx';
import { ExpenseAPI, ReportsAPI, FleetAPI, CategoriesAPI, SyncManager } from '../services/api';
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
import { DriverSettings } from '../utils/driverSettings';
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
  const speechRecognitionRef = useRef(null);
  const voiceCommandRef = useRef(null);
  const voiceSessionActiveRef = useRef(false);
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
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');
  const [toast, setToast] = useState({ message: '', type: '' });
  const [exporting, setExporting] = useState('');
  const [customCategories, setCustomCategories] = useState([]);
  const [savedCategories, setSavedCategories] = useState([]);

  const userId = localStorage.getItem('userId') || user?.id;
  const [openingIncome, setOpeningIncome] = useState(0);
  const isDemo = localStorage.getItem('authToken') === 'demo_token_12345';

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

  useEffect(() => {
    loadExpenses();
    loadMetrics();
    loadWeeklySummary();
    loadCategories();
    loadFleetStatus();
    loadHosStatus();
    setOpeningIncome(DriverSettings.getOpeningIncome(userId));
    SyncManager.enableAutoSync(userId, 30000);
  }, [userId]);

  useEffect(() => {
    if (activeTab === 'reports') {
      loadTaxReport();
      loadIftaReport();
    }
  }, [activeTab, reportQuarter, reportYear]);

  useEffect(() => {
    calculateProfit();
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem('customCategories', JSON.stringify(customCategories));
  }, [customCategories]);

  const loadCategories = async () => {
    const remote = await CategoriesAPI.list();
    if (remote?.length) {
      setSavedCategories(remote);
    } else {
      try {
        const local = localStorage.getItem('customCategories');
        if (local) setCustomCategories(JSON.parse(local));
      } catch { /* ignore */ }
    }
  };

  const loadWeeklySummary = async () => {
    const data = await ReportsAPI.getWeeklySummary();
    if (data?.days) setWeeklySummary(data);
  };

  const loadTaxReport = async () => {
    const data = await ReportsAPI.getTaxQuarterly(reportYear, reportQuarter);
    if (data) setTaxReport(data);
  };

  const loadIftaReport = async () => {
    const data = await ReportsAPI.getIfta(reportYear, reportQuarter);
    if (data) setIftaReport(data);
  };

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

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return undefined;

    setSpeechSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceHint('Listening… speak now, release when done.');
    };
    recognition.onend = () => {
      voiceSessionActiveRef.current = false;
      setIsListening(false);
      setTimeout(() => setVoiceHint(''), 2000);
    };
    recognition.onerror = (event) => {
      voiceSessionActiveRef.current = false;
      setIsListening(false);
      const messages = {
        'not-allowed': 'Microphone blocked — allow mic access in browser settings.',
        'no-speech': 'No speech detected. Hold button and speak clearly.',
        'aborted': '',
        'network': 'Voice requires an internet connection.',
      };
      const msg = messages[event.error] || `Voice error: ${event.error}`;
      if (msg) setVoiceHint(msg);
    };
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      transcript = transcript.trim();
      if (transcript && voiceCommandRef.current) {
        voiceCommandRef.current(transcript);
      }
    };

    speechRecognitionRef.current = recognition;
    return () => {
      try { recognition.stop(); } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    const releaseVoice = () => {
      if (!voiceSessionActiveRef.current) return;
      try { speechRecognitionRef.current?.stop(); } catch { /* ignore */ }
      voiceSessionActiveRef.current = false;
    };
    window.addEventListener('pointerup', releaseVoice);
    window.addEventListener('pointercancel', releaseVoice);
    return () => {
      window.removeEventListener('pointerup', releaseVoice);
      window.removeEventListener('pointercancel', releaseVoice);
    };
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast({ message: '', type: '' }), 2600);
  };

  const loadExpenses = async () => {
    setLoading(true);
    try {
      setSyncStatus('syncing');
      const data = await ExpenseAPI.getExpenses(userId);
      setExpenses(data || []);
      setSyncStatus('synced');
    } catch (error) {
      setSyncStatus('offline');
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    const data = await ReportsAPI.getMetrics('monthly');
    if (data) setMetrics(data);
  };

  const loadFleetStatus = async () => {
    const data = await FleetAPI.getStatus();
    setFleetStatus(data);
  };

  const loadHosStatus = async () => {
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
  };

  const calculateProfit = async () => {
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
  };

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
      amount: parseFloat(data.amount),
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
        payload[field] = parseFloat(data[field]);
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
    } catch (error) {
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
        category: value === 'income'
          ? (prev.category && prev.category !== 'fuel' ? prev.category : 'load')
          : (prev.category === 'load' ? 'fuel' : prev.category || 'fuel')
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
    setVoiceHint(`Captured: "${spokenText}"`);
  }, []);

  useEffect(() => {
    voiceCommandRef.current = applyVoiceCommand;
  }, [applyVoiceCommand]);

  const startVoiceCapture = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!speechRecognitionRef.current) {
      setVoiceHint('Voice recognition is not supported in this browser.');
      return;
    }
    if (voiceSessionActiveRef.current) return;
    setActiveTab('log');
    setLogView('add');
    voiceSessionActiveRef.current = true;
    setVoiceHint('Starting microphone…');
    try {
      speechRecognitionRef.current.start();
    } catch {
      voiceSessionActiveRef.current = false;
      setVoiceHint('Microphone busy — wait a moment and try again.');
    }
  };

  const stopVoiceCapture = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!speechRecognitionRef.current) return;
    try { speechRecognitionRef.current.stop(); } catch { /* ignore */ }
    voiceSessionActiveRef.current = false;
  };

  const toggleVoiceCapture = () => {
    if (isListening || voiceSessionActiveRef.current) {
      stopVoiceCapture();
    } else {
      startVoiceCapture({ preventDefault: () => {}, stopPropagation: () => {} });
    }
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

  const handleHosChange = async (status) => {
    const now = new Date().toISOString();
    if (isDemo) {
      const drivingStart = status === 'DRIVING'
        ? now
        : (hosStatus === 'DRIVING' ? drivingStartedAt : null);
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
      </div>

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

  const renderAddForm = () => (
    <section className="expense-form-section">
      <h2>{editingExpense ? `Edit ${formData.type === 'income' ? 'Income' : 'Entry'}` : 'New Entry'}</h2>
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
            <label>Description</label>
            <input type="text" name="description" value={formData.description} onChange={handleFormChange} required />
            {speechSupported && (
              <div className="voice-controls">
                <button
                  type="button"
                  className={clsx('btn-secondary voice-btn voice-btn-ptt', isListening && 'listening')}
                  onPointerDown={startVoiceCapture}
                  onPointerUp={stopVoiceCapture}
                  onPointerLeave={stopVoiceCapture}
                >
                  {isListening ? 'Release To Finish' : 'Hold To Talk'}
                </button>
                <button type="button" className="btn-secondary voice-btn-tap" onClick={toggleVoiceCapture}>
                  {isListening ? 'Stop' : 'Tap To Talk'}
                </button>
                {voiceHint && <small className="voice-hint">{voiceHint}</small>}
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Amount ($)</label>
            <input type="number" name="amount" value={formData.amount} onChange={handleFormChange} step="0.01" min="0" required />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Type</label>
            <select name="type" value={formData.type} onChange={handleFormChange}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="form-group">
            <label>Category</label>
            <select name="category" value={formData.category} onChange={handleFormChange}>
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
            <label>Miles {showLoadFields ? '(loaded)' : '(optional)'}</label>
            <input type="number" name="miles" value={formData.miles} onChange={handleFormChange} step="0.1" min="0" placeholder="Trip or loaded miles" />
          </div>
          <div className="form-group">
            <label>Odometer (optional)</label>
            <input type="number" name="odometer" value={formData.odometer} onChange={handleFormChange} step="0.1" min="0" />
          </div>
        </div>

        {showFuelFields && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label>Gallons (fuel log)</label>
                <input type="number" name="gallons" value={formData.gallons} onChange={handleFormChange} step="0.01" min="0" placeholder="IRS fuel record" />
              </div>
              <div className="form-group">
                <label>Fuel State (IFTA)</label>
                <select name="fuelState" value={formData.fuelState} onChange={handleFormChange}>
                  <option value="">Select state</option>
                  {US_STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group fuel-calc-preview">
                <label>$/Gallon</label>
                <p>
                  {formData.gallons && formData.amount
                    ? formatMoney(parseFloat(formData.amount) / parseFloat(formData.gallons))
                    : '—'}
                </p>
              </div>
              <div className="form-group fuel-calc-preview">
                <label>MPG (auto-calc)</label>
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
                <label>Broker</label>
                <input type="text" name="broker" value={formData.broker} onChange={handleFormChange} placeholder="e.g. TQL, CH Robinson" />
              </div>
              <div className="form-group">
                <label>Customer / Shipper</label>
                <input type="text" name="customer" value={formData.customer} onChange={handleFormChange} placeholder="Who you hauled for" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Deadhead Miles</label>
                <input type="number" name="deadheadMiles" value={formData.deadheadMiles} onChange={handleFormChange} step="0.1" min="0" />
              </div>
              <div className="form-group">
                <label>Tolls ($)</label>
                <input type="number" name="tollsAmount" value={formData.tollsAmount} onChange={handleFormChange} step="0.01" min="0" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Fuel Cost for Load ($)</label>
                <input type="number" name="fuelCostAlloc" value={formData.fuelCostAlloc} onChange={handleFormChange} step="0.01" min="0" />
              </div>
              <div className="form-group load-calc-preview">
                <label>Load Net Profit</label>
                <p>{formatMoney(loadPreview.netLoadProfit)}</p>
                <small>{loadPreview.profitPerMile ? `${formatMoney(loadPreview.profitPerMile)}/mi` : 'Add loaded miles'}</small>
              </div>
            </div>
          </>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Date</label>
            <input type="date" name="date" value={formData.date} onChange={handleFormChange} required />
          </div>
          <div className="form-group">
            <label>Receipt Photo</label>
            <input ref={receiptInputRef} type="file" accept="image/*" capture="environment" onChange={handleReceiptUpload} />
            {formData.receiptUrl && <span className="receipt-attached">Receipt attached</span>}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Notes</label>
            <input type="text" name="notes" value={formData.notes} onChange={handleFormChange} placeholder="Optional" />
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

      {loading ? (
        <p className="loading">Loading...</p>
      ) : sortedExpenses.length === 0 ? (
        <div className="no-data"><p>No entries yet.</p></div>
      ) : (
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
      )}
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
      <h2>Reports</h2>

      <div className="report-quarter-picker">
        <label>
          Year
          <select value={reportYear} onChange={e => setReportYear(Number(e.target.value))}>
            {[reportYear - 1, reportYear, reportYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Quarter
          <select value={reportQuarter} onChange={e => setReportQuarter(Number(e.target.value))}>
            {[1, 2, 3, 4].map(q => (
              <option key={q} value={q}>Q{q}</option>
            ))}
          </select>
        </label>
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

  return (
    <div className={clsx('dashboard', `theme-${theme}`, isNight && 'night-drive')}>
      <div className="console-screensaver" aria-hidden="true">
        <img src={`${process.env.PUBLIC_URL}/truck-console-bg.png`} alt="" className="console-truck-art" />
        <div className="console-screensaver-glow" />
      </div>

      <header className={clsx('dashboard-header', isNight && 'night-drive')}>
        <div className="header-top">
          <div className="header-brand">
            <h1>RigHand Pro</h1>
            <p className="user-info">{user?.name || user?.email || 'Driver'}</p>
          </div>
          <div className="header-actions">
            <span className={`sync-status ${syncStatus}`}>{syncStatus}</span>
            <button type="button" onClick={onLogout} className="btn-logout">Logout</button>
          </div>
        </div>

        <nav className="header-nav" aria-label="Main navigation">
          {[
            { id: 'home', label: 'Home', icon: '⌂' },
            { id: 'log', label: 'Log', icon: '✎' },
            { id: 'reports', label: 'Reports', icon: '⎙' },
            { id: 'hos', label: 'HOS', icon: '⏱' },
            { id: 'fleet', label: 'Fleet', icon: '⛟' },
            { id: 'admin', label: 'Admin', icon: '⚙' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              className={clsx('header-nav-item', activeTab === tab.id && 'active')}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="header-nav-icon" aria-hidden="true">{tab.icon}</span>
              <span className="header-nav-label">{tab.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="dashboard-main">
        {toast.message && (
          <div className={`toast-banner ${toast.type}`} role="status">{toast.message}</div>
        )}

        {activeTab === 'home' && renderHome()}
        {activeTab === 'log' && renderLog()}
        {activeTab === 'reports' && renderReports()}
        {activeTab === 'hos' && renderHos()}
        {activeTab === 'fleet' && <FleetDashboard fleetStatus={fleetStatus} isDemo={isDemo} />}
        {activeTab === 'admin' && (
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
        )}
      </main>
    </div>
  );
};

export default Dashboard;

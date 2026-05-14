import React, { useState, useEffect, useRef } from 'react';
import { ExpenseAPI, SyncManager } from '../services/api';
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
  const speechRecognitionRef = useRef(null);
  const toastTimerRef = useRef(null);
  const [expenses, setExpenses] = useState([]);
  const [profit, setProfit] = useState({ totalIncome: 0, totalExpenses: 0, netProfit: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category: 'fuel',
    type: 'expense',
    date: new Date().toISOString().split('T')[0]
  });
  const [syncStatus, setSyncStatus] = useState('synced');
  const [filter, setFilter] = useState({ category: '', type: '' });
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');
  const [toast, setToast] = useState({ message: '', type: '' });
  const [customCategories, setCustomCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('customCategories');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      return [];
    }
  });

  const userId = localStorage.getItem('userId') || user?.id;
  const categoryValuesFromExpenses = expenses.map(expense => expense.category).filter(Boolean);
  const allCategoryValues = Array.from(new Set([
    ...DEFAULT_CATEGORIES.map(category => category.value),
    ...customCategories,
    ...categoryValuesFromExpenses
  ]));
  const pendingCount = expenses.filter(expense => expense.offline || expense.synced === false).length;
  const monthEntryCount = expenses.filter(expense => {
    const entryDate = new Date(expense.date);
    const now = new Date();
    return entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear();
  }).length;

  // Load expenses on mount
  useEffect(() => {
    loadExpenses();
    // Enable auto-sync
    SyncManager.enableAutoSync(userId, 30000);
  }, [userId]);

  // Calculate profit whenever expenses change
  useEffect(() => {
    calculateProfit();
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem('customCategories', JSON.stringify(customCategories));
  }, [customCategories]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceHint('Listening... speak your entry now.');
    };

    recognition.onend = () => {
      setIsListening(false);
      setTimeout(() => setVoiceHint(''), 1800);
    };

    recognition.onerror = () => {
      setVoiceHint('Voice input failed. Please try again.');
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      applyVoiceCommand(transcript);
    };

    speechRecognitionRef.current = recognition;

    return () => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
    };
  }, []);

  const loadExpenses = async () => {
    setLoading(true);
    try {
      setSyncStatus('syncing');
      const data = await ExpenseAPI.getExpenses(userId);
      setExpenses(data || []);
      setSyncStatus('synced');
    } catch (error) {
      console.error('Error loading expenses:', error);
      setSyncStatus('offline');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToast({ message: '', type: '' });
    }, 2600);
  };

  const calculateProfit = async () => {
    const startDate = new Date();
    startDate.setDate(1); // First day of month
    const endDate = new Date();

    try {
      const profitData = await ExpenseAPI.calculateNetProfit(userId, startDate, endDate);
      setProfit(profitData);
    } catch (error) {
      // Calculate locally
      const monthExpenses = expenses.filter(e => {
        const expDate = new Date(e.date);
        return expDate >= startDate && expDate <= endDate;
      });

      const totalIncome = monthExpenses
        .filter(e => e.type === 'income')
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

      const totalExpenses = monthExpenses
        .filter(e => e.type === 'expense')
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

      setProfit({
        totalIncome,
        totalExpenses,
        netProfit: totalIncome - totalExpenses
      });
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!formData.description || !formData.amount || !formData.category) {
      alert('Please fill in all fields');
      return;
    }

    try {
      setSyncStatus('syncing');
      const newExpense = {
        ...formData,
        amount: parseFloat(formData.amount),
        userId
      };

      const result = await ExpenseAPI.createExpense(newExpense, userId);
      
      // Reload to show new expense
      loadExpenses();
      
      // Reset form
      setFormData({
        description: '',
        amount: '',
        category: 'fuel',
        type: 'expense',
        date: new Date().toISOString().split('T')[0]
      });
      setShowForm(false);

      if (result.offline) {
        setSyncStatus('pending');
        showToast('Saved offline. Will sync when internet returns.', 'warning');
      } else {
        setSyncStatus('synced');
        showToast('Entry saved successfully.', 'success');
      }
    } catch (error) {
      alert('Error adding expense: ' + error.message);
      setSyncStatus('error');
      showToast('Failed to save entry.', 'error');
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Delete this expense?')) return;

    try {
      setSyncStatus('syncing');
      await ExpenseAPI.deleteExpense(expenseId, userId);
      setExpenses(expenses.filter(e => e.id !== expenseId));
      setSyncStatus('synced');
      showToast('Entry deleted.', 'success');
    } catch (error) {
      alert('Error deleting expense: ' + error.message);
      showToast('Unable to delete entry.', 'error');
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    if (name === 'category' && value === '__custom__') {
      setFormData(prev => ({ ...prev, category: '' }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateCategory = (e) => {
    e.preventDefault();
    const normalizedCategory = normalizeCategoryValue(customCategoryInput);

    if (!normalizedCategory) {
      alert('Please enter a valid category name.');
      return;
    }

    if (allCategoryValues.includes(normalizedCategory)) {
      setFormData(prev => ({ ...prev, category: normalizedCategory }));
      setCustomCategoryInput('');
      return;
    }

    setCustomCategories(prev => [...prev, normalizedCategory]);
    setFormData(prev => ({ ...prev, category: normalizedCategory }));
    setCustomCategoryInput('');
    showToast(`Category "${getCategoryLabel(normalizedCategory)}" added.`, 'success');
  };

  const applyVoiceCommand = (spokenText) => {
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

    const cleanedDescription = spokenText
      .replace(/\$?\d+(\.\d{1,2})?/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    setShowForm(true);
    setFormData(prev => ({
      ...prev,
      description: cleanedDescription || prev.description,
      amount: parsedAmount || prev.amount,
      category: parsedCategory,
      type: parsedType
    }));

    setVoiceHint(`Captured: "${spokenText}"`);
  };

  const startVoiceCapture = () => {
    if (!speechRecognitionRef.current) {
      setVoiceHint('Voice recognition is not supported in this browser.');
      return;
    }

    if (isListening) {
      return;
    }

    setShowForm(true);
    try {
      speechRecognitionRef.current.start();
    } catch (error) {
      setVoiceHint('Microphone is already active. Release and try again.');
    }
  };

  const stopVoiceCapture = () => {
    if (!speechRecognitionRef.current || !isListening) {
      return;
    }

    speechRecognitionRef.current.stop();
  };

  const applyUsualTemplate = (template) => {
    setShowForm(true);
    setFormData(prev => ({
      ...prev,
      description: template.description,
      category: template.category,
      type: template.type
    }));
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

  const profitStatus = profit.netProfit >= 0 ? 'positive' : 'negative';

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>🚚 RigHand AI - Profit Dashboard</h1>
          <div className="header-actions">
            <span className={`sync-status ${syncStatus}`}>
              {syncStatus === 'synced' && '✓ Synced'}
              {syncStatus === 'syncing' && '⟳ Syncing...'}
              {syncStatus === 'offline' && '⊙ Offline Mode'}
              {syncStatus === 'pending' && '⧖ Pending Sync'}
              {syncStatus === 'error' && '✗ Error'}
            </span>
            <button onClick={onLogout} className="btn-logout">Logout</button>
          </div>
        </div>
        <p className="user-info">Welcome, {user?.name || user?.email || 'Driver'}</p>
      </header>

      <main className="dashboard-main">
        {toast.message && (
          <div className={`toast-banner ${toast.type}`} role="status" aria-live="polite">
            {toast.message}
          </div>
        )}

        <section className="profit-summary">
          <div className="profit-card income">
            <h3>Monthly Income</h3>
            <p className="amount">${profit.totalIncome.toFixed(2)}</p>
          </div>
          <div className="profit-card expenses">
            <h3>Total Expenses</h3>
            <p className="amount">${profit.totalExpenses.toFixed(2)}</p>
          </div>
          <div className={`profit-card net-profit ${profitStatus}`}>
            <h3>Net Profit</h3>
            <p className="amount">${profit.netProfit.toFixed(2)}</p>
          </div>
        </section>

        <section className="insight-strip">
          <div className="insight-pill">
            <span className="insight-label">Entries This Month</span>
            <strong>{monthEntryCount}</strong>
          </div>
          <div className="insight-pill">
            <span className="insight-label">Pending Sync</span>
            <strong>{pendingCount}</strong>
          </div>
          <div className="insight-pill">
            <span className="insight-label">Current Mode</span>
            <strong>{syncStatus === 'offline' ? 'Offline' : 'Online'}</strong>
          </div>
        </section>

        <section className="actions-section">
          <button 
            onClick={() => setShowForm(!showForm)} 
            className="btn-primary"
          >
            {showForm ? '✕ Cancel' : '+ Add Expense/Income'}
          </button>
          <button onClick={loadExpenses} className="btn-secondary">
            ⟳ Refresh
          </button>
        </section>

        <section className="usual-expenses-section">
          <h2>Usual Expenses / Income</h2>
          <p className="usual-expenses-help">Use one-click templates to fill common entries faster.</p>
          <div className="usual-expenses-grid">
            {USUAL_EXPENSE_TEMPLATES.map(template => (
              <button
                key={template.label}
                type="button"
                className="usual-expense-btn"
                onClick={() => applyUsualTemplate(template)}
              >
                {template.label}
              </button>
            ))}
          </div>
        </section>

        {showForm && (
          <section className="expense-form-section">
            <h2>Add Expense/Income</h2>
            <form onSubmit={handleAddExpense} className="expense-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    name="description"
                    value={formData.description}
                    onChange={handleFormChange}
                    placeholder="e.g., Fuel stop, Maintenance"
                    required
                  />
                  {speechSupported && (
                    <div className="voice-controls">
                      <div className={`voice-live-indicator ${isListening ? 'active' : ''}`}>
                        <span className="voice-live-dot" />
                        <span>{isListening ? 'Live: listening from microphone' : 'Idle: hold button to talk'}</span>
                      </div>
                      <button
                        type="button"
                        className={`btn-secondary voice-btn voice-btn-ptt ${isListening ? 'listening' : ''}`}
                        onMouseDown={startVoiceCapture}
                        onMouseUp={stopVoiceCapture}
                        onMouseLeave={stopVoiceCapture}
                        onTouchStart={startVoiceCapture}
                        onTouchEnd={stopVoiceCapture}
                        onTouchCancel={stopVoiceCapture}
                      >
                        {isListening ? '🎙 Release To Submit Voice' : '🎤 Hold To Talk'}
                      </button>
                      <small className="form-help">Say: "Fuel expense 125" or "Load income 800". Bluetooth headset mics work automatically.</small>
                      {voiceHint && <small className="voice-hint">{voiceHint}</small>}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Amount ($)</label>
                  <input
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleFormChange}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    required
                  />
                  <div className="quick-amounts" role="group" aria-label="Quick amount buttons">
                    {(formData.type === 'income' ? ['500', '800', '1200'] : ['25', '75', '150']).map(value => (
                      <button
                        key={value}
                        type="button"
                        className="quick-amount-btn"
                        onClick={() => setFormData(prev => ({ ...prev, amount: value }))}
                      >
                        ${value}
                      </button>
                    ))}
                  </div>
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
                      <option key={category} value={category}>{getCategoryLabel(category)}</option>
                    ))}
                    <option value="__custom__">+ Create New Category</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Create Category</label>
                  <div className="category-create-group">
                    <input
                      type="text"
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value)}
                      placeholder="e.g., parking, insurance"
                    />
                    <button type="button" className="btn-secondary" onClick={handleCreateCategory}>
                      Add Category
                    </button>
                  </div>
                  <small className="form-help">Creates a reusable category and selects it for this entry.</small>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleFormChange}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary">Save Entry</button>
            </form>
          </section>
        )}

        <section className="expenses-section">
          <h2>Expense History</h2>
          <div className="filters">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search description or category"
              className="filter-input"
            />
            <select 
              value={filter.type} 
              onChange={(e) => setFilter({...filter, type: e.target.value})}
              className="filter-select"
            >
              <option value="">All Types</option>
              <option value="expense">Expenses Only</option>
              <option value="income">Income Only</option>
            </select>
            <select 
              value={filter.category} 
              onChange={(e) => setFilter({...filter, category: e.target.value})}
              className="filter-select"
            >
              <option value="">All Categories</option>
              {allCategoryValues.map(category => (
                <option key={category} value={category}>{getCategoryLabel(category)}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="filter-select"
            >
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="amount_desc">Amount High-Low</option>
              <option value="amount_asc">Amount Low-High</option>
            </select>
          </div>

          {loading ? (
            <p className="loading">Loading expenses...</p>
          ) : filteredExpenses.length === 0 ? (
            <div className="no-data">
              <p>No expenses recorded yet. Add your first entry!</p>
              <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
                + Add First Entry
              </button>
            </div>
          ) : (
            <table className="expenses-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedExpenses.map(expense => (
                  <tr key={expense.id} className={expense.offline ? 'offline' : ''}>
                    <td>{new Date(expense.date).toLocaleDateString()}</td>
                    <td>{expense.description}</td>
                    <td><span className="badge">{getCategoryLabel(expense.category)}</span></td>
                    <td>
                      <span className={`type-badge ${expense.type}`}>
                        {expense.type === 'income' ? '↓ Income' : '↑ Expense'}
                      </span>
                    </td>
                    <td className={expense.type === 'income' ? 'income-amount' : 'expense-amount'}>
                      {expense.type === 'income' ? '+' : '-'}${Math.abs(expense.amount).toFixed(2)}
                    </td>
                    <td>
                      <button 
                        onClick={() => handleDeleteExpense(expense.id)}
                        className="btn-delete"
                        title="Delete"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
};

export default Dashboard;

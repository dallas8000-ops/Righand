import React, { useState, useEffect } from 'react';
import { ExpenseAPI, SyncManager } from '../services/api';
import { ExpenseDB } from '../services/offlineDB';
import './Dashboard.css';

const Dashboard = ({ user, onLogout }) => {
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

  const userId = localStorage.getItem('userId') || user?.id;

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
    if (!formData.description || !formData.amount) {
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
      } else {
        setSyncStatus('synced');
      }
    } catch (error) {
      alert('Error adding expense: ' + error.message);
      setSyncStatus('error');
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Delete this expense?')) return;

    try {
      setSyncStatus('syncing');
      await ExpenseAPI.deleteExpense(expenseId, userId);
      setExpenses(expenses.filter(e => e.id !== expenseId));
      setSyncStatus('synced');
    } catch (error) {
      alert('Error deleting expense: ' + error.message);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const filteredExpenses = expenses.filter(e => {
    if (filter.category && e.category !== filter.category) return false;
    if (filter.type && e.type !== filter.type) return false;
    return true;
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
                    <option value="fuel">Fuel</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="tolls">Tolls</option>
                    <option value="food">Food/Hotel</option>
                    <option value="other">Other</option>
                    <option value="load">Load/Freight Income</option>
                  </select>
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
              <option value="fuel">Fuel</option>
              <option value="maintenance">Maintenance</option>
              <option value="tolls">Tolls</option>
              <option value="food">Food/Hotel</option>
              <option value="load">Load Income</option>
              <option value="other">Other</option>
            </select>
          </div>

          {loading ? (
            <p className="loading">Loading expenses...</p>
          ) : filteredExpenses.length === 0 ? (
            <p className="no-data">No expenses recorded yet. Add your first entry!</p>
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
                {filteredExpenses.map(expense => (
                  <tr key={expense.id} className={expense.offline ? 'offline' : ''}>
                    <td>{new Date(expense.date).toLocaleDateString()}</td>
                    <td>{expense.description}</td>
                    <td><span className="badge">{expense.category}</span></td>
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

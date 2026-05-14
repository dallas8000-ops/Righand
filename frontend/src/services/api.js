import axios from 'axios';
import { ExpenseDB, SyncQueueDB } from './offlineDB';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Add auth token to requests
export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

// Expense API calls
export const ExpenseAPI = {
  async createExpense(expenseData, userId) {
    try {
      // First save to local DB
      const localId = await ExpenseDB.addExpense({
        ...expenseData,
        userId
      });

      // Try to sync with backend
      try {
        const response = await api.post('/expenses', {
          ...expenseData,
          userId,
          localId
        });

        // Update local record with server ID
        await ExpenseDB.updateExpense(localId, {
          serverId: response.data.id,
          synced: true
        });

        return response.data;
      } catch (error) {
        // If offline, add to sync queue
        await SyncQueueDB.addToQueue(userId, 'CREATE_EXPENSE', {
          localId,
          ...expenseData
        });
        return { id: localId, ...expenseData, offline: true };
      }
    } catch (error) {
      console.error('Error creating expense:', error);
      throw error;
    }
  },

  async getExpenses(userId) {
    try {
      // Try to fetch from server
      const response = await api.get(`/expenses/user/${userId}`);
      
      // Sync with local DB
      for (const expense of response.data) {
        if (!await ExpenseDB.getAllExpenses(userId).then(exps => 
          exps.some(e => e.serverId === expense.id)
        )) {
          await ExpenseDB.addExpense({
            ...expense,
            serverId: expense.id,
            synced: true,
            userId
          });
        }
      }
      
      return response.data;
    } catch (error) {
      console.warn('Failed to fetch expenses from server, using local:', error.message);
      // Return local data if offline
      return await ExpenseDB.getAllExpenses(userId);
    }
  },

  async updateExpense(expenseId, updates, userId) {
    try {
      const response = await api.put(`/expenses/${expenseId}`, {
        ...updates,
        userId
      });

      await ExpenseDB.updateExpense(expenseId, updates);
      return response.data;
    } catch (error) {
      // Queue update for later sync
      await SyncQueueDB.addToQueue(userId, 'UPDATE_EXPENSE', {
        expenseId,
        ...updates
      });
      await ExpenseDB.updateExpense(expenseId, updates);
      return { id: expenseId, ...updates, offline: true };
    }
  },

  async deleteExpense(expenseId, userId) {
    try {
      await api.delete(`/expenses/${expenseId}`);
      await ExpenseDB.deleteExpense(expenseId);
      return { success: true };
    } catch (error) {
      // Queue deletion for later sync
      await SyncQueueDB.addToQueue(userId, 'DELETE_EXPENSE', {
        expenseId
      });
      await ExpenseDB.deleteExpense(expenseId);
      return { success: true, offline: true };
    }
  },

  async calculateNetProfit(userId, startDate, endDate) {
    try {
      const response = await api.get('/expenses/profit', {
        params: { userId, startDate, endDate }
      });
      return response.data;
    } catch (error) {
      console.warn('Failed to get profit from server, calculating locally:', error.message);
      // Calculate from local data
      const expenses = await ExpenseDB.getExpensesByDateRange(userId, startDate, endDate);
      const profit = {
        totalIncome: expenses
          .filter(e => e.type === 'income')
          .reduce((sum, e) => sum + (e.amount || 0), 0),
        totalExpenses: expenses
          .filter(e => e.type === 'expense')
          .reduce((sum, e) => sum + (e.amount || 0), 0),
        netProfit: 0
      };
      profit.netProfit = profit.totalIncome - profit.totalExpenses;
      return profit;
    }
  }
};

// Authentication API calls
export const AuthAPI = {
  async login(email, password) {
    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.data.token) {
        setAuthToken(response.data.token);
        localStorage.setItem('authToken', response.data.token);
      }
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  async register(userData) {
    try {
      const response = await api.post('/auth/register', userData);
      if (response.data.token) {
        setAuthToken(response.data.token);
        localStorage.setItem('authToken', response.data.token);
      }
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }
    setAuthToken(null);
    localStorage.removeItem('authToken');
  },

  async verifyToken(token) {
    try {
      const response = await api.get('/auth/verify', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      return null;
    }
  }
};

// Sync manager for handling offline queue
export const SyncManager = {
  async syncPendingData(userId) {
    const unsyncedItems = await SyncQueueDB.getUnsyncedItems(userId);
    
    for (const item of unsyncedItems) {
      try {
        if (item.action === 'CREATE_EXPENSE') {
          const response = await api.post('/expenses', item.data);
          await SyncQueueDB.markAsSynced(item.id);
          await ExpenseDB.updateExpense(item.data.localId, {
            serverId: response.data.id,
            synced: true
          });
        } else if (item.action === 'UPDATE_EXPENSE') {
          await api.put(`/expenses/${item.data.expenseId}`, item.data);
          await SyncQueueDB.markAsSynced(item.id);
        } else if (item.action === 'DELETE_EXPENSE') {
          await api.delete(`/expenses/${item.data.expenseId}`);
          await SyncQueueDB.markAsSynced(item.id);
        }
      } catch (error) {
        console.error(`Failed to sync ${item.action}:`, error);
        // Continue with other items
      }
    }
  },

  async enableAutoSync(userId, intervalMs = 30000) {
    setInterval(() => {
      this.syncPendingData(userId).catch(console.error);
    }, intervalMs);
  }
};

export default api;

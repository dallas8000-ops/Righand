import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { ExpenseDB, SyncQueueDB } from './offlineDB';

const PRODUCTION_API = 'https://righand-frontend-production.up.railway.app/api';
const sameOriginApi =
  typeof window !== 'undefined' ? `${window.location.origin}/api` : PRODUCTION_API;
const defaultApiUrl = Capacitor.isNativePlatform()
  ? PRODUCTION_API
  : sameOriginApi;
const rawApiUrl = process.env.REACT_APP_API_URL || defaultApiUrl;
const API_BASE_URL = rawApiUrl.endsWith('/api')
  ? rawApiUrl
  : `${rawApiUrl.replace(/\/$/, '')}/api`;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: Capacitor.isNativePlatform() ? 45000 : 15000,
});

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

const normalizeExpense = (expense) => {
  const localId = expense.localId
    ?? (expense.serverId ? expense.id : undefined)
    ?? (typeof expense.id === 'number' ? expense.id : undefined);

  return {
    ...expense,
    id: expense.serverId || expense.id,
    localId,
    userId: expense.userId || expense.user_id,
    type: expense.type || expense.expense_type || 'expense',
    date: expense.date || expense.expense_date,
    amount: expense.amount != null ? Number(expense.amount) : expense.amount,
    deadheadMiles: expense.deadheadMiles ?? expense.deadhead_miles,
    tollsAmount: expense.tollsAmount ?? expense.tolls_amount,
    fuelCostAlloc: expense.fuelCostAlloc ?? expense.fuel_cost_alloc,
    receiptUrl: expense.receiptUrl ?? expense.receipt_url,
    broker: expense.broker ?? '',
    customer: expense.customer ?? '',
    fuelState: expense.fuelState ?? expense.fuel_state ?? '',
  };
};

export const isDemoMode = () => localStorage.getItem('authToken') === 'demo_token_12345';

const resolveExpenseId = (expenseOrId) => {
  if (expenseOrId && typeof expenseOrId === 'object') {
    return expenseOrId.serverId || expenseOrId.id;
  }
  return expenseOrId;
};

export const ExpenseAPI = {
  async createExpense(expenseData, userId) {
    if (isDemoMode()) {
      const localId = await ExpenseDB.addExpense({ ...expenseData, userId, synced: true });
      const created = normalizeExpense({ id: localId, ...expenseData, userId, synced: true });
      return created;
    }

    try {
      const localId = await ExpenseDB.addExpense({ ...expenseData, userId });

      try {
        const response = await api.post('/expenses', { ...expenseData, userId, localId });
        await ExpenseDB.updateExpense(localId, {
          serverId: response.data.id,
          synced: true
        });
        return normalizeExpense(response.data.expense || response.data);
      } catch (error) {
        await SyncQueueDB.addToQueue(userId, 'CREATE_EXPENSE', {
          localId,
          ...expenseData
        });
        return normalizeExpense({ id: localId, ...expenseData, userId, offline: true });
      }
    } catch (error) {
      console.error('Error creating expense:', error);
      throw error;
    }
  },

  async getExpenses(userId) {
    if (isDemoMode()) {
      const local = await ExpenseDB.getAllExpenses(userId);
      return local.map(normalizeExpense).sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    try {
      const response = await api.get(`/expenses/user/${userId}`);
      const list = response.data.expenses || response.data || [];
      const normalized = list.map(normalizeExpense);

      for (const expense of normalized) {
        const local = await ExpenseDB.getAllExpenses(userId);
        const existing = local.find(e => e.serverId === expense.id);
        if (existing) {
          await ExpenseDB.updateExpense(existing.id, { ...expense, serverId: expense.id, synced: true });
        } else {
          await ExpenseDB.addExpense({
            ...expense,
            serverId: expense.id,
            synced: true,
            userId
          });
        }
      }

      return normalized;
    } catch (error) {
      console.warn('Failed to fetch expenses from server, using local:', error.message);
      const local = await ExpenseDB.getAllExpenses(userId);
      return local.map(normalizeExpense);
    }
  },

  async updateExpense(expenseOrId, updates, userId) {
    const expenseId = resolveExpenseId(expenseOrId);
    const localId = expenseOrId?.localId ?? expenseOrId?.id;

    if (isDemoMode()) {
      await ExpenseDB.updateExpense(localId ?? expenseId, { ...updates, synced: true });
      const all = await ExpenseDB.getAllExpenses(userId);
      const row = all.find(e =>
        e.id === (localId ?? expenseId)
        || e.serverId === expenseId
        || String(e.id) === String(expenseId)
      );
      return normalizeExpense({ ...row, ...updates, userId });
    }

    try {
      const response = await api.put(`/expenses/${expenseId}`, updates);
      await ExpenseDB.updateExpense(localId ?? expenseId, { ...updates, synced: true });
      return normalizeExpense(response.data.expense || response.data);
    } catch (error) {
      await SyncQueueDB.addToQueue(userId, 'UPDATE_EXPENSE', {
        expenseId,
        ...updates
      });
      await ExpenseDB.updateExpense(localId ?? expenseId, updates);
      return normalizeExpense({ id: expenseId, ...updates, userId, offline: true });
    }
  },

  async deleteExpense(expenseOrId, userId) {
    const expenseId = resolveExpenseId(expenseOrId);
    const localId = expenseOrId?.localId ?? expenseOrId?.id;

    if (isDemoMode()) {
      await ExpenseDB.deleteExpense(localId ?? expenseId);
      return { success: true };
    }

    try {
      await api.delete(`/expenses/${expenseId}`);
      await ExpenseDB.deleteExpense(localId ?? expenseId);
      return { success: true };
    } catch (error) {
      await SyncQueueDB.addToQueue(userId, 'DELETE_EXPENSE', { expenseId });
      await ExpenseDB.deleteExpense(localId ?? expenseId);
      return { success: true, offline: true };
    }
  },

  async calculateNetProfit(userId, startDate, endDate) {
    try {
      const response = await api.get('/expenses/profit', {
        params: {
          userId,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        }
      });
      return response.data;
    } catch (error) {
      const expenses = await ExpenseDB.getExpensesByDateRange(userId, startDate, endDate);
      const totalIncome = expenses
        .filter(e => e.type === 'income')
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const totalExpenses = expenses
        .filter(e => e.type === 'expense')
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      return {
        totalIncome,
        totalExpenses,
        netProfit: totalIncome - totalExpenses
      };
    }
  }
};

export const ReportsAPI = {
  async getMetrics(period = 'monthly') {
    try {
      const response = await api.get('/reports/metrics', { params: { period } });
      return response.data;
    } catch (error) {
      return null;
    }
  },

  async downloadPdf(period = 'monthly') {
    const response = await api.get('/reports/export/pdf', {
      params: { period },
      responseType: 'blob'
    });
    return response.data;
  },

  async downloadCsv(period = 'monthly') {
    const response = await api.get('/reports/export/csv', {
      params: { period },
      responseType: 'blob'
    });
    return response.data;
  },

  async getWeeklySummary() {
    try {
      const response = await api.get('/reports/weekly-summary');
      return response.data;
    } catch {
      return null;
    }
  },

  async getTaxQuarterly(year, quarter) {
    try {
      const response = await api.get('/reports/tax/quarterly', { params: { year, quarter } });
      return response.data;
    } catch {
      return null;
    }
  },

  async getIfta(year, quarter) {
    try {
      const response = await api.get('/reports/ifta', { params: { year, quarter } });
      return response.data;
    } catch {
      return null;
    }
  }
};

export const CategoriesAPI = {
  async list() {
    try {
      const response = await api.get('/categories');
      return response.data.categories || [];
    } catch {
      return null;
    }
  },

  async create(label, entryType = 'expense') {
    const response = await api.post('/categories', { label, entryType });
    return response.data.category;
  },

  async remove(categoryId) {
    await api.delete(`/categories/${categoryId}`);
    return { success: true };
  }
};

export const OpsAPI = {
  async getLoadPackets() {
    const response = await api.get('/ops/load-packets');
    return response.data.loadPackets || [];
  },

  async saveLoadPacket(packet) {
    const response = packet.id
      ? await api.put(`/ops/load-packets/${packet.id}`, packet)
      : await api.post('/ops/load-packets', packet);
    return response.data.loadPacket;
  },

  async createLoadPacket(packet) {
    const response = await api.post('/ops/load-packets', packet);
    return response.data.loadPacket;
  },

  async deleteLoadPacket(packetId) {
    await api.delete(`/ops/load-packets/${packetId}`);
    return { success: true };
  },

  async getMaintenanceItems() {
    const response = await api.get('/ops/maintenance');
    return response.data.maintenanceItems || [];
  },

  async saveMaintenanceItem(item) {
    const response = item.id
      ? await api.put(`/ops/maintenance/${item.id}`, item)
      : await api.post('/ops/maintenance', item);
    return response.data.maintenanceItem;
  },

  async createMaintenanceItem(item) {
    const response = await api.post('/ops/maintenance', item);
    return response.data.maintenanceItem;
  },

  async deleteMaintenanceItem(itemId) {
    await api.delete(`/ops/maintenance/${itemId}`);
    return { success: true };
  }
};

export const SubscriptionAPI = {
  async getMe() {
    const response = await api.get('/subscriptions/me');
    return response.data;
  },

  async verifyPurchase({ productId, googleOrderId, googleProductId, purchaseToken }) {
    const response = await api.post('/subscriptions/verify-purchase', {
      productId,
      googleOrderId,
      googleProductId,
      purchaseToken,
    });
    return response.data;
  },

  async activate(tier = 'pro') {
    const response = await api.post('/subscriptions/activate', { tier });
    return response.data;
  },

  async startStripeCheckout(tier = 'pro') {
    const response = await api.post('/subscriptions/stripe-checkout', {
      tier,
      frontendUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
    return response.data;
  },
};

export const FleetAPI = {
  async getStatus() {
    try {
      const response = await api.get('/fleet/status');
      return response.data;
    } catch (error) {
      return { hasFleet: false, tier: 'solo' };
    }
  },

  async getDriverSummaries() {
    const response = await api.get('/fleet/drivers/summary');
    return response.data;
  },

  async postLocation(payload) {
    return api.post('/fleet/location', payload);
  },

  async getHosStatus() {
    try {
      const response = await api.get('/fleet/hos/status');
      return response.data;
    } catch (error) {
      return null;
    }
  },

  async setHosStatus(status) {
    const response = await api.post('/fleet/hos/status', { status });
    return response.data;
  }
};

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
      }
    }
  },

  enableAutoSync(userId, intervalMs = 30000) {
    setInterval(() => {
      this.syncPendingData(userId).catch(console.error);
    }, intervalMs);
  }
};

export default api;

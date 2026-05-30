import Dexie from 'dexie';

export const db = new Dexie('RigHandDB');

db.version(1).stores({
  expenses: '++id, userId, date, category',
  users: '++id, email, userId',
  syncQueue: '++id, userId, timestamp, synced'
});

db.version(2).stores({
  expenses: '++id, userId, date, category, serverId',
  users: '++id, email, userId',
  syncQueue: '++id, userId, timestamp, synced'
});

export const ExpenseDB = {
  async addExpense(expense) {
    return await db.expenses.add({
      ...expense,
      synced: false,
      syncedAt: null,
      createdAt: new Date().toISOString()
    });
  },

  async getAllExpenses(userId) {
    return await db.expenses.where('userId').equals(userId).toArray();
  },

  async getExpensesByDateRange(userId, startDate, endDate) {
    return await db.expenses
      .where('userId')
      .equals(userId)
      .filter(exp => {
        const expDate = new Date(exp.date);
        return expDate >= startDate && expDate <= endDate;
      })
      .toArray();
  },

  async updateExpense(id, updates) {
    const patch = {
      ...updates,
      synced: updates.synced ?? false,
      updatedAt: new Date().toISOString()
    };
    const numericId = Number.isInteger(id) ? id : null;
    if (numericId) {
      return await db.expenses.update(numericId, patch);
    }
    const all = await db.expenses.toArray();
    const match = all.find(e => e.serverId === id || String(e.id) === String(id));
    if (!match) return 0;
    return await db.expenses.update(match.id, patch);
  },

  async deleteExpense(id) {
    const all = await db.expenses.toArray();
    const match = all.find(e => e.serverId === id || String(e.id) === String(id) || e.id === id);
    if (match) {
      return await db.expenses.delete(match.id);
    }
    return await db.expenses.delete(id);
  },

  async clearLocalData(userId) {
    return await db.expenses.where('userId').equals(userId).delete();
  }
};

export const SyncQueueDB = {
  async addToQueue(userId, action, data) {
    return await db.syncQueue.add({
      userId,
      action,
      data,
      timestamp: new Date().toISOString(),
      synced: false
    });
  },

  async getUnsyncedItems(userId) {
    return await db.syncQueue
      .where('userId')
      .equals(userId)
      .filter(item => !item.synced)
      .toArray();
  },

  async markAsSynced(id) {
    return await db.syncQueue.update(id, {
      synced: true,
      syncedAt: new Date().toISOString()
    });
  },

  async clearSyncedItems() {
    return await db.syncQueue.where('synced').equals(true).delete();
  }
};

export const UserDB = {
  async saveUserSession(userId, email, userData) {
    return await db.users.put({
      userId,
      email,
      userData,
      lastLogin: new Date().toISOString()
    });
  },

  async getUserSession(userId) {
    return await db.users.get(userId);
  },

  async clearUserSession(userId) {
    return await db.users.delete(userId);
  }
};

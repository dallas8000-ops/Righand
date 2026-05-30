const key = (userId, field) => `righand_${field}_${userId}`;

export const DriverSettings = {
  getOpeningIncome(userId) {
    const raw = localStorage.getItem(key(userId, 'opening_income'));
    const val = parseFloat(raw);
    return Number.isFinite(val) ? val : 0;
  },

  setOpeningIncome(userId, amount) {
    localStorage.setItem(key(userId, 'opening_income'), String(amount || 0));
  }
};

const activeKey = (userId) => `righand_active_trip_${userId}`;
const historyKey = (userId) => `righand_trip_history_${userId}`;

const parseMiles = (value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export const TripTracker = {
  getActiveTrip(userId) {
    try {
      const raw = localStorage.getItem(activeKey(userId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  startTrip(userId, startMiles) {
    const miles = parseMiles(startMiles);
    if (miles === null) return { ok: false, error: 'Enter a valid beginning odometer reading.' };

    const trip = {
      active: true,
      startMiles: miles,
      startedAt: new Date().toISOString()
    };
    localStorage.setItem(activeKey(userId), JSON.stringify(trip));
    return { ok: true, trip };
  },

  endTrip(userId, endMiles) {
    const active = TripTracker.getActiveTrip(userId);
    if (!active?.active) return { ok: false, error: 'No trip in progress.' };

    const end = parseMiles(endMiles);
    if (end === null) return { ok: false, error: 'Enter a valid ending odometer reading.' };
    if (end < active.startMiles) {
      return { ok: false, error: 'End miles must be greater than or equal to start miles.' };
    }

    const completed = {
      startMiles: active.startMiles,
      endMiles: end,
      totalMiles: Math.round((end - active.startMiles) * 10) / 10,
      startedAt: active.startedAt,
      endedAt: new Date().toISOString()
    };

    localStorage.removeItem(activeKey(userId));
    TripTracker.addToHistory(userId, completed);
    return { ok: true, trip: completed };
  },

  cancelTrip(userId) {
    localStorage.removeItem(activeKey(userId));
  },

  getLastEndMiles(userId) {
    const history = TripTracker.getHistory(userId);
    return history.length ? history[0].endMiles : null;
  },

  getHistory(userId) {
    try {
      const raw = localStorage.getItem(historyKey(userId));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  addToHistory(userId, trip) {
    const history = TripTracker.getHistory(userId);
    history.unshift(trip);
    localStorage.setItem(historyKey(userId), JSON.stringify(history.slice(0, 30)));
  }
};

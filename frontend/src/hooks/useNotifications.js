import { useEffect, useRef, useCallback } from 'react';
import { formatCurrency } from '../utils/currency';

const STORAGE_KEY = 'righandNotifications';

export function useNotifications({ enabled, pendingCount, netProfit, profitMilestone = 1000, formatMoney = (value) => formatCurrency(value, 'USD', { maximumFractionDigits: 0 }) }) {
  const lastMilestoneRef = useRef(0);
  const lastPendingRef = useRef(0);

  const notify = useCallback((title, body) => {
    if (!enabled || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body, icon: '/favicon.ico' });
    } catch {
      /* ignore */
    }
  }, [enabled]);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    if (pendingCount > 0 && lastPendingRef.current === 0) {
      notify('RigHand — Sync Pending', `${pendingCount} entries waiting to sync when online.`);
    }
    lastPendingRef.current = pendingCount;

    const milestone = Math.floor(netProfit / profitMilestone) * profitMilestone;
    if (milestone > 0 && milestone > lastMilestoneRef.current) {
      notify('RigHand — Profit Milestone', `Net profit reached ${formatMoney(milestone)} this month!`);
      lastMilestoneRef.current = milestone;
    }
  }, [enabled, pendingCount, netProfit, profitMilestone, notify, formatMoney]);

  return { notify, requestPermission };
}

export function loadNotificationPref() {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

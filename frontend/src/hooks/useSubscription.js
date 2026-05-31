import { useCallback, useEffect, useState } from 'react';
import { SubscriptionAPI } from '../services/api';

const PAID_TIERS = new Set(['pro', 'fleet']);

export function useSubscription(isDemo) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(!isDemo);

  const refresh = useCallback(async () => {
    if (isDemo) {
      setSubscription({ tier: 'free', active: false });
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const data = await SubscriptionAPI.getMe();
      setSubscription(data);
      return data;
    } catch {
      setSubscription({ tier: 'free', active: false });
      return null;
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const tier = subscription?.tier || 'free';
  const isPro = isDemo ? false : PAID_TIERS.has(tier);
  const isFleetPaid = isDemo ? false : tier === 'fleet';

  return { subscription, loading, isPro, isFleetPaid, refresh, tier };
}

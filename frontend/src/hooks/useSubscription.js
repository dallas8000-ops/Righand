import { useCallback, useEffect, useState } from 'react';
import { SubscriptionAPI } from '../services/api';

const PAID_TIERS = new Set(['pro', 'fleet']);

const isDeveloperMode = () => (
  typeof localStorage !== 'undefined'
  && localStorage.getItem('righandDeveloperMode') === 'true'
);

export function useSubscription(isDemo) {
  const developerMode = isDeveloperMode();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(!isDemo && !developerMode);

  const refresh = useCallback(async () => {
    if (developerMode) {
      const devSubscription = {
        tier: 'fleet',
        active: true,
        subscriberId: 'DEV-LOCAL',
        products: {
          pro: { productId: 'developer_compliance_pro' },
          fleet: { productId: 'developer_fleet_lite' }
        }
      };
      setSubscription(devSubscription);
      setLoading(false);
      return devSubscription;
    }
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
  }, [isDemo, developerMode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const tier = subscription?.tier || 'free';
  const isPro = isDemo ? false : PAID_TIERS.has(tier);
  const isFleetPaid = isDemo ? false : tier === 'fleet';

  return { subscription, loading, isPro, isFleetPaid, refresh, tier };
}

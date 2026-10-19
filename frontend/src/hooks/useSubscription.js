import { useCallback, useEffect, useState } from 'react';
import { SubscriptionAPI } from '../services/api';

const PAID_TIERS = new Set(['pro', 'fleet']);

// The localStorage flag only counts in developer builds (or `npm start`), so a
// leftover or hand-set flag can never unlock Pro screens on the live site.
const isDeveloperBuild = () => (
  process.env.REACT_APP_DEVELOPER_BUILD === 'true'
  || process.env.NODE_ENV === 'development'
);

export const isDeveloperMode = () => (
  isDeveloperBuild()
  && typeof localStorage !== 'undefined'
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
  const isInTrial = !isDemo && Boolean(subscription?.trialActive);
  const trialExpired = !isDemo && Boolean(subscription?.trialExpired);
  const trialDaysLeft = subscription?.trialDaysLeft ?? 0;

  return { subscription, loading, isPro, isFleetPaid, refresh, tier, isInTrial, trialExpired, trialDaysLeft };
}

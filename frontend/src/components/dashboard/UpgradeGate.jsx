import React, { useEffect, useState } from 'react';
import { SubscriptionAPI } from '../../services/api';

const TIER_COPY = {
  pro: {
    title: 'Compliance Pro',
    price: 34.99,
    blurb: 'Tax reports, IFTA package, HOS-lite, maintenance reminders, document packets, exports, Admin, and custom categories.',
  },
  fleet: {
    title: 'Fleet Lite',
    price: 89,
    blurb: 'Everything in Compliance Pro plus up to 5 drivers, dispatcher view, and live GPS sharing.',
  },
};

const UpgradeGate = ({ tier = 'pro', subscription, onUnlocked, children }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = TIER_COPY[tier] || TIER_COPY.pro;

  const productId = subscription?.products?.[tier]?.productId;
  const stripeConfigured = Boolean(subscription?.stripeConfigured);
  const alreadyUnlocked =
    tier === 'fleet'
      ? subscription?.tier === 'fleet'
      : subscription?.tier === 'pro' || subscription?.tier === 'fleet';

  const handlePurchaseComplete = async (orderId, product) => {
    setBusy(true);
    setError('');
    try {
      await SubscriptionAPI.verifyPurchase({
        productId: product || productId,
        googleOrderId: orderId,
      });
      if (onUnlocked) await onUnlocked();
    } catch (err) {
      setError(err?.error || err?.message || 'Purchase verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleStripeCheckout = async () => {
    setBusy(true);
    setError('');
    try {
      const session = await SubscriptionAPI.startStripeCheckout(tier);
      if (session?.url) {
        window.location.assign(session.url);
        return;
      }
      setError('Stripe checkout did not return a checkout URL.');
    } catch (err) {
      setError(err?.error || err?.message || 'Stripe checkout failed.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    window.RigHandBilling = window.RigHandBilling || {};
    window.RigHandBilling.onPurchase = (purchase) => {
      if (!purchase?.orderId || !purchase?.productId) return;
      handlePurchaseComplete(purchase.orderId, purchase.productId);
    };
    return () => {
      if (window.RigHandBilling?.onPurchase) {
        delete window.RigHandBilling.onPurchase;
      }
    };
  });

  if (alreadyUnlocked) {
    return children || null;
  }

  return (
    <section className="upgrade-gate">
      <div className="upgrade-gate-card">
        <p className="upgrade-badge">Upgrade</p>
        <h2>{copy.title}</h2>
        <p className="upgrade-price">${copy.price}/mo</p>
        <p className="admin-hint">{copy.blurb}</p>
        <p className="admin-hint">
          Subscribe with Stripe on web or in the <strong>Google Play</strong> app on Android.
          After payment, features unlock automatically.
        </p>
        {productId && (
          <p className="upgrade-product-id">
            Product ID: <code>{productId}</code>
          </p>
        )}
        {error && <p className="error-message">{error}</p>}
        {stripeConfigured && (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={handleStripeCheckout}
          >
            {busy ? 'Opening checkout...' : 'Subscribe with Stripe'}
          </button>
        )}
        {process.env.NODE_ENV === 'development' && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => handlePurchaseComplete(`DEV-${Date.now()}`, productId || tier)}
          >
            {busy ? 'Verifying…' : 'Dev: simulate payment'}
          </button>
        )}
      </div>
    </section>
  );
};

export default UpgradeGate;

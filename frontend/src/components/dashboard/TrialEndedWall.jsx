import React from 'react';
import UpgradeGate from './UpgradeGate';

// Shown instead of the whole app once the 30-day trial is over and no plan is active.
const TrialEndedWall = ({ subscription, onUnlocked, onLogout }) => (
  <main className="trial-ended-wall" aria-labelledby="trial-ended-title">
    <h1 id="trial-ended-title">Your free trial has ended</h1>
    <p className="admin-hint">
      Choose a plan to keep using RigHand. Your records are kept safe and are back the moment you subscribe.
    </p>
    <div className="trial-ended-plans">
      <UpgradeGate tier="pro" subscription={subscription} onUnlocked={onUnlocked} />
      <UpgradeGate tier="fleet" subscription={subscription} onUnlocked={onUnlocked} />
    </div>
    {onLogout && (
      <button type="button" className="btn-secondary" onClick={onLogout}>Log out</button>
    )}
  </main>
);

export default TrialEndedWall;

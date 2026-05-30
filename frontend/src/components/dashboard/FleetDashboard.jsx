import React, { useEffect, useState } from 'react';
import { FleetAPI } from '../../services/api';

const formatMoney = (v) => `$${Number(v || 0).toFixed(2)}`;

const FleetDashboard = ({ fleetStatus, isDemo }) => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!fleetStatus?.hasFleet || isDemo) return;
    setLoading(true);
    FleetAPI.getDriverSummaries()
      .then(data => setDrivers(data.drivers || []))
      .catch(() => setError('Could not load fleet data.'))
      .finally(() => setLoading(false));
  }, [fleetStatus, isDemo]);

  if (!fleetStatus?.hasFleet) {
    return (
      <section className="fleet-dashboard upgrade">
        <h2>Fleet</h2>
        <p className="admin-hint">Fleet Lite adds multi-driver P&amp;L and live GPS. Contact support to enable.</p>
      </section>
    );
  }

  if (isDemo) {
    return (
      <section className="fleet-dashboard">
        <h2>Fleet</h2>
        <p className="admin-hint">Not available in demo mode.</p>
      </section>
    );
  }

  return (
    <section className="fleet-dashboard">
      <h2>Fleet</h2>
      <p className="admin-hint">
        {fleetStatus.tenant?.name} · {fleetStatus.tenant?.driverCount}/{fleetStatus.tenant?.maxDrivers} drivers
      </p>

      {loading && <p>Loading drivers...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && drivers.length === 0 && (
        <p className="admin-hint">No drivers linked yet.</p>
      )}

      <div className="fleet-driver-grid">
        {drivers.map(driver => (
          <article key={driver.driverId} className="fleet-driver-card">
            <h3>{driver.name}</h3>
            <p className="fleet-driver-email">{driver.email}</p>
            <div className="fleet-driver-metrics">
              <div><span>Income</span><strong className="income-amount">{formatMoney(driver.totalIncome)}</strong></div>
              <div><span>Expenses</span><strong className="expense-amount">{formatMoney(driver.totalExpenses)}</strong></div>
              <div><span>Net</span><strong className={driver.netProfit >= 0 ? 'income-amount' : 'expense-amount'}>{formatMoney(driver.netProfit)}</strong></div>
            </div>
            {driver.lastLocation && (
              <p className="fleet-location">
                Last ping: {driver.lastLocation.lat.toFixed(4)}, {driver.lastLocation.lng.toFixed(4)}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};

export default FleetDashboard;

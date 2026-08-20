import React, { useEffect, useState, useCallback } from 'react';
import { FleetAPI } from '../../services/api';
import { useFleetLocation } from '../../hooks/useFleetLocation';
import UpgradeGate from './UpgradeGate';
import { formatCurrency } from '../../utils/currency';

const defaultFormatMoney = (value) => formatCurrency(value, 'USD');

const formatTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const mapsUrl = (lat, lng) =>
  `https://www.google.com/maps?q=${lat},${lng}`;

const FleetDashboard = ({ fleetStatus, isDemo, userId, subscription, onUnlocked, formatMoney = defaultFormatMoney }) => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isDispatcher = fleetStatus?.role === 'owner' || fleetStatus?.role === 'dispatcher';
  const canShareGps = fleetStatus?.role === 'driver' || fleetStatus?.role === 'owner';
  const fleetEnabled = fleetStatus?.hasFleet && !isDemo;

  const gps = useFleetLocation(userId, fleetEnabled && canShareGps);

  const loadDrivers = useCallback(() => {
    if (!fleetEnabled || !isDispatcher) return;
    setLoading(true);
    setError('');
    FleetAPI.getDriverSummaries()
      .then(data => setDrivers(data.drivers || []))
      .catch(() => setError('Could not load fleet data.'))
      .finally(() => setLoading(false));
  }, [fleetEnabled, isDispatcher]);

  useEffect(() => {
    loadDrivers();
  }, [loadDrivers]);

  const handleToggleGps = async () => {
    if (gps.sharing) {
      gps.stopSharing();
    } else {
      await gps.startSharing();
    }
  };

  if (!fleetStatus?.hasFleet) {
    return (
      <UpgradeGate tier="fleet" subscription={subscription} onUnlocked={onUnlocked}>
        <section className="fleet-dashboard upgrade">
          <h2>Dispatch</h2>
          <p className="admin-hint">Dispatch unlocked - refresh if this message persists.</p>
        </section>
      </UpgradeGate>
    );
  }

  if (isDemo) {
    return (
      <section className="fleet-dashboard">
        <h2>Dispatch</h2>
        <p className="admin-hint">Not available in demo mode. Log in with a fleet-enabled account.</p>
      </section>
    );
  }

  return (
    <section className="fleet-dashboard">
      <div className="fleet-dashboard-header">
        <div>
          <h2>Dispatch</h2>
          <p className="admin-hint">
            {fleetStatus.tenant?.name} · {fleetStatus.tenant?.seatCount ?? fleetStatus.tenant?.driverCount}/{fleetStatus.tenant?.maxDrivers} Fleet Lite seats used
            {fleetStatus.role && ` · Your role: ${fleetStatus.role}`}
          </p>
        </div>
        {isDispatcher && (
          <button type="button" className="btn-secondary" onClick={loadDrivers}>Refresh</button>
        )}
      </div>

      {canShareGps && (
        <div className="fleet-gps-panel">
          <h3>Share location with dispatcher</h3>
          <p className="admin-hint">
            Sends GPS to your fleet every 3 minutes while enabled.
            {gps.isNative ? ' Works in the Android app.' : ' Best on the Android app.'}
          </p>
          <div className="fleet-gps-status">
            <span className={`fleet-gps-dot ${gps.sharing ? 'active' : ''}`} />
            <strong>{gps.sharing ? 'Sharing active' : 'Not sharing'}</strong>
          </div>
          {gps.lastPing && (
            <p className="fleet-gps-last">
              Last ping: {formatTime(gps.lastPing.at)} · {gps.lastPing.lat.toFixed(4)}, {gps.lastPing.lng.toFixed(4)}
              {gps.lastPing.speed > 0 && ` · ${gps.lastPing.speed} mph`}
            </p>
          )}
          {gps.error && <p className="trip-error">{gps.error}</p>}
          <div className="trip-actions">
            <button type="button" className="btn-primary" onClick={handleToggleGps}>
              {gps.sharing ? 'Stop sharing' : 'Start sharing'}
            </button>
            <button type="button" className="btn-secondary" onClick={gps.pingNow}>Ping now</button>
          </div>
        </div>
      )}

      {isDispatcher && (
        <>
          {loading && <p>Loading drivers...</p>}
          {error && <p className="error-text">{error}</p>}

          {!loading && drivers.length === 0 && (
            <p className="admin-hint">No drivers linked yet. Add drivers with setup_fleet.py.</p>
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
                {driver.lastLocation ? (
                  <div className="fleet-location-block">
                    <p className="fleet-location">
                      {driver.lastLocation.lat.toFixed(4)}, {driver.lastLocation.lng.toFixed(4)}
                    </p>
                    <p className="fleet-location-time">
                      Updated {formatTime(driver.lastLocation.recordedAt)}
                    </p>
                    <a
                      className="fleet-map-link"
                      href={mapsUrl(driver.lastLocation.lat, driver.lastLocation.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in Maps
                    </a>
                  </div>
                ) : (
                  <p className="admin-hint">No GPS ping yet - driver must enable sharing in Dispatch.</p>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default FleetDashboard;

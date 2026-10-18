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

const FleetDashboard = ({ fleetStatus, isDemo, userId, subscription, onUnlocked, onFleetChanged, formatMoney = defaultFormatMoney }) => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [needsAccountDetails, setNeedsAccountDetails] = useState(false);
  const [driverForm, setDriverForm] = useState({ email: '', name: '', truckerLicense: '', password: '', role: 'driver' });
  const [driverMessage, setDriverMessage] = useState('');
  const [savingDriver, setSavingDriver] = useState(false);

  const isOwner = fleetStatus?.role === 'owner';
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

  const updateDriverForm = (field) => (e) => setDriverForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleAddDriver = async (e) => {
    e.preventDefault();
    setSavingDriver(true);
    setDriverMessage('');
    try {
      const payload = { email: driverForm.email, role: driverForm.role };
      if (needsAccountDetails) {
        payload.name = driverForm.name;
        payload.truckerLicense = driverForm.truckerLicense;
        payload.password = driverForm.password;
      }
      const result = await FleetAPI.addDriver(payload);
      setDriverMessage(`${result.member.name} added as ${result.member.role}.${result.created ? ' Share the temporary password so they can log in.' : ''}`);
      setDriverForm({ email: '', name: '', truckerLicense: '', password: '', role: 'driver' });
      setNeedsAccountDetails(false);
      loadDrivers();
      onFleetChanged?.();
    } catch (err) {
      const data = err?.response?.data;
      if (data?.code === 'ACCOUNT_DETAILS_REQUIRED') {
        setNeedsAccountDetails(true);
        setDriverMessage('No account with that email yet. Enter the driver name, driving licence number and a temporary password to create one.');
      } else {
        setDriverMessage(data?.error || 'Could not add driver.');
      }
    } finally {
      setSavingDriver(false);
    }
  };

  const handleRemoveDriver = async (driver) => {
    if (!window.confirm(`Remove ${driver.name} from your fleet?`)) return;
    try {
      await FleetAPI.removeDriver(driver.driverId);
      loadDrivers();
      onFleetChanged?.();
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not remove driver.');
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
          <h3>Share your location with your dispatcher</h3>
          <p className="admin-hint">
            Sends your location to your fleet every 3 minutes while this is on.
            {gps.isNative ? ' Works in the Android app.' : ' Best on the Android app.'}
          </p>
          <div className="fleet-gps-status">
            <span className={`fleet-gps-dot ${gps.sharing ? 'active' : ''}`} />
            <strong>{gps.sharing ? 'Location sharing is on' : 'Location sharing is off'}</strong>
          </div>
          {gps.lastPing && (
            <p className="fleet-gps-last">
              Last location sent: {formatTime(gps.lastPing.at)} · {gps.lastPing.lat.toFixed(4)}, {gps.lastPing.lng.toFixed(4)}
              {gps.lastPing.speed > 0 && ` · ${gps.lastPing.speed} km/h`}
            </p>
          )}
          {gps.error && <p className="trip-error">{gps.error}</p>}
          <div className="trip-actions">
            <button type="button" className="btn-primary" onClick={handleToggleGps}>
              {gps.sharing ? 'Stop sharing' : 'Start sharing'}
            </button>
            <button type="button" className="btn-secondary" onClick={gps.pingNow}>Send location now</button>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="fleet-add-driver">
          <button type="button" className="btn-primary" onClick={() => setShowAddDriver(show => !show)}>
            {showAddDriver ? 'Close' : '+ Add driver'}
          </button>
          {showAddDriver && (
            <form onSubmit={handleAddDriver} className="expense-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="fleet-driver-email">Driver email</label>
                  <input id="fleet-driver-email" type="email" required value={driverForm.email} onChange={updateDriverForm('email')} />
                </div>
                <div className="form-group">
                  <label htmlFor="fleet-driver-role">Role</label>
                  <select id="fleet-driver-role" value={driverForm.role} onChange={updateDriverForm('role')}>
                    <option value="driver">Driver</option>
                    <option value="dispatcher">Dispatcher</option>
                  </select>
                </div>
              </div>
              {needsAccountDetails && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="fleet-driver-name">Full name</label>
                      <input id="fleet-driver-name" type="text" required value={driverForm.name} onChange={updateDriverForm('name')} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="fleet-driver-license">Driving licence number</label>
                      <input id="fleet-driver-license" type="text" required value={driverForm.truckerLicense} onChange={updateDriverForm('truckerLicense')} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="fleet-driver-password">Temporary password (min 6 characters)</label>
                    <input id="fleet-driver-password" type="text" required minLength={6} value={driverForm.password} onChange={updateDriverForm('password')} />
                  </div>
                </>
              )}
              <button type="submit" className="btn-primary" disabled={savingDriver}>
                {savingDriver ? 'Adding...' : 'Add to fleet'}
              </button>
            </form>
          )}
          {driverMessage && <p className="admin-hint">{driverMessage}</p>}
        </div>
      )}

      {isDispatcher && (
        <>
          {loading && <p>Loading drivers...</p>}
          {error && <p className="error-text">{error}</p>}

          {!loading && drivers.length === 0 && (
            <p className="admin-hint">
              No drivers linked yet.{isOwner ? ' Use "+ Add driver" above.' : ' Ask the fleet owner to add drivers.'}
            </p>
          )}

          <div className="fleet-driver-grid">
            {drivers.map(driver => (
              <article key={driver.driverId} className="fleet-driver-card">
                <h3>{driver.name}</h3>
                <p className="fleet-driver-email">{driver.email}</p>
                {isOwner && (
                  <button type="button" className="btn-secondary" onClick={() => handleRemoveDriver(driver)}>Remove</button>
                )}
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
                  <p className="admin-hint">No location received yet - the driver must turn on location sharing in Dispatch.</p>
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

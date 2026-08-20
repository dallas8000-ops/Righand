import React, { useCallback, useEffect, useState } from 'react';
import { TripTracker as TripStore } from '../../utils/tripTracker';
import { useGpsTrip } from '../../hooks/useGpsTrip';
import { useObd } from '../../hooks/useObd';

const formatMiles = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

const formatTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const TRIP_MODE_TABS = [
  { id: 'manual', label: 'Manual' },
  { id: 'gps', label: 'GPS' },
  { id: 'obd', label: 'OBD' }
];

const TripTracker = ({ userId, onLogMiles }) => {
  const [mode, setMode] = useState('manual');
  const [activeTrip, setActiveTrip] = useState(null);
  const [lastCompleted, setLastCompleted] = useState(null);
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [error, setError] = useState('');
  const [gpsResult, setGpsResult] = useState(null);
  const [obdStartOdo, setObdStartOdo] = useState('');

  const gps = useGpsTrip();
  const obd = useObd();

  const tripInProgress = activeTrip?.active || gps.tripActive;

  const refresh = useCallback(() => {
    setActiveTrip(TripStore.getActiveTrip(userId));
    const lastEnd = TripStore.getLastEndMiles(userId);
    if (lastEnd != null && !TripStore.getActiveTrip(userId)) {
      setStartInput(String(lastEnd));
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (obd.vehicleData.odometerMiles && !obdStartOdo) {
      setObdStartOdo(String(obd.vehicleData.odometerMiles));
    }
  }, [obd.vehicleData.odometerMiles, obdStartOdo]);

  const clearResults = () => {
    setGpsResult(null);
    setLastCompleted(null);
    setError('');
  };

  // ---- Manual mode (odometer) ----
  const handleManualStart = () => {
    setError('');
    clearResults();
    const result = TripStore.startTrip(userId, startInput);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setActiveTrip(result.trip);
    setEndInput('');
  };

  const handleManualEnd = () => {
    setError('');
    const result = TripStore.endTrip(userId, endInput);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setActiveTrip(null);
    setLastCompleted(result.trip);
    setStartInput(String(result.trip.endMiles));
    setEndInput('');
  };

  const handleManualCancel = () => {
    TripStore.cancelTrip(userId);
    setActiveTrip(null);
    setError('');
  };

  const handleNewManualTrip = () => {
    const endMiles = lastCompleted?.endMiles;
    setLastCompleted(null);
    if (endMiles != null) setStartInput(String(endMiles));
  };

  // ---- GPS mode ----
  const handleGpsStart = async () => {
    clearResults();
    await gps.startTrip();
  };

  const handleGpsEnd = async () => {
    const result = await gps.endTrip();
    setGpsResult(result);
  };

  // ---- OBD mode ----
  const handleObdStart = async () => {
    clearResults();
    if (obd.status !== 'connected') {
      await obd.connect();
      return;
    }
    if (obd.vehicleData.odometerMiles) {
      setObdStartOdo(String(obd.vehicleData.odometerMiles));
    }
    await gps.startTrip();
  };

  const handleObdEnd = async () => {
    const result = await gps.endTrip();
    if (obd.vehicleData.odometerMiles && obdStartOdo) {
      const obdMiles = obd.vehicleData.odometerMiles - Number.parseFloat(obdStartOdo);
      setGpsResult({
        ...result,
        miles: obdMiles > 0 ? Number.parseFloat(obdMiles.toFixed(1)) : result.miles,
        source: obdMiles > 0 ? 'obd' : 'gps'
      });
    } else {
      setGpsResult({ ...result, source: 'gps' });
    }
  };

  const displayTotal = () => {
    if (gpsResult) return gpsResult.miles;
    if (lastCompleted) return lastCompleted.totalMiles;
    return null;
  };

  const totalMiles = displayTotal();

  const handleLogMiles = () => {
    if (totalMiles != null && onLogMiles) onLogMiles(totalMiles);
  };

  const renderResult = () => {
    if (totalMiles == null) return null;

    if (lastCompleted && !gpsResult) {
      return (
        <div className="trip-completed">
          <p className="trip-completed-label">Last trip</p>
          <div className="trip-odometer-row">
            <div>
              <span className="trip-odometer-label">Start</span>
              <strong>{formatMiles(lastCompleted.startMiles)}</strong>
            </div>
            <span className="trip-arrow">→</span>
            <div>
              <span className="trip-odometer-label">End</span>
              <strong>{formatMiles(lastCompleted.endMiles)}</strong>
            </div>
          </div>
          <p className="trip-total">
            Total: <strong>{formatMiles(lastCompleted.totalMiles)} mi</strong>
          </p>
          <div className="trip-actions">
            <button type="button" className="btn-primary" onClick={handleNewManualTrip}>Start New Trip</button>
            {onLogMiles && (
              <button type="button" className="btn-secondary" onClick={handleLogMiles}>Log Miles</button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="trip-completed">
        <p className="trip-completed-label">Trip complete</p>
        <p className="trip-total trip-result-miles">
          <strong>{formatMiles(totalMiles)} mi</strong>
          {gpsResult?.durationMinutes != null && (
            <span className="trip-duration"> · {gpsResult.durationMinutes} min</span>
          )}
        </p>
        {gpsResult?.source === 'obd' && (
          <p className="admin-hint">Miles from OBD odometer</p>
        )}
        <div className="trip-actions">
          <button type="button" className="btn-primary" onClick={clearResults}>New Trip</button>
          {onLogMiles && (
            <button type="button" className="btn-secondary" onClick={handleLogMiles}>Log Miles</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="trip-tracker">
      <div className="trip-tracker-header">
        <h2>Trip Miles</h2>
        {tripInProgress && (
          <span className="trip-status-badge active">In progress</span>
        )}
      </div>

      <div className="trip-mode-tabs">
        {TRIP_MODE_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={mode === tab.id ? 'trip-mode-tab active' : 'trip-mode-tab'}
            onClick={() => setMode(tab.id)}
            disabled={tripInProgress}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!totalMiles && mode === 'manual' && !activeTrip?.active && (
        <div className="trip-idle">
          <div className="trip-field">
            <label htmlFor="trip-start-odometer">Beginning odometer</label>
            <input
              id="trip-start-odometer"
              type="number"
              step="0.1"
              min="0"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              placeholder="e.g. 145230.5"
              className="trip-input"
            />
          </div>
          <button type="button" className="btn-primary trip-start-btn" onClick={handleManualStart}>
            Start Trip
          </button>
        </div>
      )}

      {!totalMiles && mode === 'manual' && activeTrip?.active && (
        <div className="trip-active">
          <div className="trip-odometer-display">
            <div className="trip-odometer-block start">
              <span className="trip-odometer-label">Start miles</span>
              <strong>{formatMiles(activeTrip.startMiles)}</strong>
              <small>Started {formatTime(activeTrip.startedAt)}</small>
            </div>
          </div>
          <div className="trip-field">
            <label htmlFor="trip-end-odometer">End odometer</label>
            <input
              id="trip-end-odometer"
              type="number"
              step="0.1"
              min={activeTrip.startMiles}
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              placeholder="Enter when you arrive"
              className="trip-input"
            />
          </div>
          {endInput && Number.parseFloat(endInput) >= activeTrip.startMiles && (
            <p className="trip-preview">
              Trip total: <strong>{formatMiles(Number.parseFloat(endInput) - activeTrip.startMiles)} mi</strong>
            </p>
          )}
          <div className="trip-actions">
            <button type="button" className="btn-primary" onClick={handleManualEnd}>End Trip</button>
            <button type="button" className="btn-secondary" onClick={handleManualCancel}>Cancel</button>
          </div>
        </div>
      )}

      {!totalMiles && mode === 'gps' && (
        <div className="trip-gps">
          {gps.error && <p className="trip-error">{gps.error}</p>}
          {gps.tripActive ? (
            <>
              <div className="trip-live-stat">
                <div>
                  <span className="trip-odometer-label">Live miles</span>
                  <strong className="trip-live-miles">{formatMiles(gps.tripMiles)}</strong>
                </div>
                {gps.currentSpeed !== null && (
                  <div>
                    <span className="trip-odometer-label">Speed</span>
                    <strong className="trip-live-speed">{gps.currentSpeed} mph</strong>
                  </div>
                )}
              </div>
              <button type="button" className="btn-primary trip-end-btn" onClick={handleGpsEnd}>End Trip</button>
            </>
          ) : (
            <>
              <p className="admin-hint">GPS tracks miles automatically while you drive. Works in browser and Android app.</p>
              <button type="button" className="btn-primary trip-start-btn" onClick={handleGpsStart}>Start GPS Trip</button>
            </>
          )}
        </div>
      )}

      {!totalMiles && mode === 'obd' && (
        <div className="trip-obd">
          {obd.error && <p className="trip-error">{obd.error}</p>}
          {!obd.isNative && (
            <p className="admin-hint">OBD dongle connection requires the Android app. Use Manual or GPS in the browser.</p>
          )}
          <div className="obd-status-row">
            <span>Status:</span>
            <strong>{obd.status}</strong>
            {obd.deviceName && <span className="obd-device-name"> — {obd.deviceName}</span>}
          </div>
          {obd.status === 'connected' && (
            <div className="obd-gauges">
              <div className="obd-gauge">
                <span className="trip-odometer-label">Speed</span>
                <strong>{obd.vehicleData.speedMph ?? '—'} mph</strong>
              </div>
              <div className="obd-gauge">
                <span className="trip-odometer-label">RPM</span>
                <strong>{obd.vehicleData.rpm ?? '—'}</strong>
              </div>
              <div className="obd-gauge">
                <span className="trip-odometer-label">Fuel</span>
                <strong>{obd.vehicleData.fuelPct ?? '—'}%</strong>
              </div>
              <div className="obd-gauge">
                <span className="trip-odometer-label">Odometer</span>
                <strong>
                  {obd.vehicleData.odometerMiles
                    ? `${obd.vehicleData.odometerMiles.toLocaleString()} mi`
                    : 'N/A'}
                </strong>
              </div>
            </div>
          )}
          {gps.tripActive && (
            <p className="trip-preview">GPS backup: <strong>{formatMiles(gps.tripMiles)} mi</strong></p>
          )}
          <div className="trip-actions">
            {!gps.tripActive ? (
              <button type="button" className="btn-primary" onClick={handleObdStart}>
                {obd.status !== 'connected' ? 'Connect OBD + Start' : 'Start Trip'}
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={handleObdEnd}>End Trip</button>
            )}
            {obd.status === 'connected' && (
              <button type="button" className="btn-secondary" onClick={obd.disconnect}>Disconnect</button>
            )}
          </div>
        </div>
      )}

      {renderResult()}

      {error && <p className="trip-error">{error}</p>}
    </section>
  );
};

export default TripTracker;

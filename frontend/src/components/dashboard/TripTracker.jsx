import React, { useEffect, useState } from 'react';
import { TripTracker as TripStore } from '../../utils/tripTracker';

const formatMiles = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

const formatTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const TripTracker = ({ userId, onLogMiles }) => {
  const [activeTrip, setActiveTrip] = useState(null);
  const [lastCompleted, setLastCompleted] = useState(null);
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [error, setError] = useState('');

  const refresh = () => {
    setActiveTrip(TripStore.getActiveTrip(userId));
    const lastEnd = TripStore.getLastEndMiles(userId);
    if (lastEnd != null && !TripStore.getActiveTrip(userId)) {
      setStartInput(String(lastEnd));
    }
  };

  useEffect(() => {
    refresh();
  }, [userId]);

  const handleStart = () => {
    setError('');
    const result = TripStore.startTrip(userId, startInput);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setActiveTrip(result.trip);
    setEndInput('');
    setLastCompleted(null);
  };

  const handleEnd = () => {
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

  const handleCancel = () => {
    TripStore.cancelTrip(userId);
    setActiveTrip(null);
    setError('');
  };

  const handleNewTrip = () => {
    const endMiles = lastCompleted?.endMiles;
    setLastCompleted(null);
    if (endMiles != null) {
      setStartInput(String(endMiles));
    }
  };

  return (
    <section className="trip-tracker">
      <div className="trip-tracker-header">
        <h2>Trip Miles</h2>
        {activeTrip?.active && (
          <span className="trip-status-badge active">In progress</span>
        )}
      </div>

      {lastCompleted && !activeTrip?.active && (
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
            <button type="button" className="btn-primary" onClick={handleNewTrip}>Start New Trip</button>
            {onLogMiles && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onLogMiles(lastCompleted.totalMiles)}
              >
                Log Miles
              </button>
            )}
          </div>
        </div>
      )}

      {!lastCompleted && !activeTrip?.active && (
        <div className="trip-idle">
          <label className="trip-field">
            <span>Beginning odometer</span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              placeholder="e.g. 145230.5"
              className="trip-input"
            />
          </label>
          <button type="button" className="btn-primary trip-start-btn" onClick={handleStart}>
            Start Trip
          </button>
        </div>
      )}

      {activeTrip?.active && (
        <div className="trip-active">
          <div className="trip-odometer-display">
            <div className="trip-odometer-block start">
              <span className="trip-odometer-label">Start miles</span>
              <strong>{formatMiles(activeTrip.startMiles)}</strong>
              <small>Started {formatTime(activeTrip.startedAt)}</small>
            </div>
          </div>

          <label className="trip-field">
            <span>End odometer</span>
            <input
              type="number"
              step="0.1"
              min={activeTrip.startMiles}
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              placeholder="Enter when you arrive"
              className="trip-input"
            />
          </label>

          {endInput && Number.parseFloat(endInput) >= activeTrip.startMiles && (
            <p className="trip-preview">
              Trip total: <strong>{formatMiles(Number.parseFloat(endInput) - activeTrip.startMiles)} mi</strong>
            </p>
          )}

          <div className="trip-actions">
            <button type="button" className="btn-primary" onClick={handleEnd}>End Trip</button>
            <button type="button" className="btn-secondary" onClick={handleCancel}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="trip-error">{error}</p>}
    </section>
  );
};

export default TripTracker;

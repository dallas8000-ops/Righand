import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

const WATCH_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000
};

const MIN_DELTA_MILES = 0.02;

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function processPosition(position, lastCoordRef, accumulatedMilesRef, setters) {
  const { latitude, longitude, speed } = position.coords;
  const { setCurrentSpeed, setCurrentCoords, setTripMiles } = setters;

  if (speed !== null && speed >= 0) {
    setCurrentSpeed(Math.round(speed * 2.237));
  }

  setCurrentCoords({ lat: latitude, lng: longitude });

  if (lastCoordRef.current) {
    const delta = haversineMiles(
      lastCoordRef.current.lat,
      lastCoordRef.current.lng,
      latitude,
      longitude
    );

    if (delta >= MIN_DELTA_MILES) {
      accumulatedMilesRef.current += delta;
      setTripMiles(Number.parseFloat(accumulatedMilesRef.current.toFixed(1)));
      lastCoordRef.current = { lat: latitude, lng: longitude };
    }
  } else {
    lastCoordRef.current = { lat: latitude, lng: longitude };
  }
}

export function useGpsTrip() {
  const [tripActive, setTripActive] = useState(false);
  const [tripMiles, setTripMiles] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [error, setError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('prompt');

  const watchIdRef = useRef(null);
  const lastCoordRef = useRef(null);
  const accumulatedMilesRef = useRef(0);
  const tripStartTimeRef = useRef(null);
  const browserWatchRef = useRef(null);

  const requestPermission = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import('@capacitor/geolocation');
        const status = await Geolocation.requestPermissions({
          permissions: ['location', 'coarseLocation']
        });
        const granted =
          status.location === 'granted' || status.coarseLocation === 'granted';
        setPermissionStatus(granted ? 'granted' : 'denied');
        return granted;
      }

      if (!navigator.geolocation) {
        setError('Location not available on this device');
        setPermissionStatus('denied');
        return false;
      }

      setPermissionStatus('granted');
      return true;
    } catch {
      if (navigator.geolocation) {
        setPermissionStatus('granted');
        return true;
      }
      setError('Location not available on this device');
      return false;
    }
  }, []);

  const startTrip = useCallback(async () => {
    setError(null);
    const ok = await requestPermission();
    if (!ok) {
      setError('Location permission denied. Enable in device Settings.');
      return;
    }

    accumulatedMilesRef.current = 0;
    lastCoordRef.current = null;
    tripStartTimeRef.current = new Date();
    setTripMiles(0);
    setTripActive(true);

    const setters = { setCurrentSpeed, setCurrentCoords, setTripMiles };

    try {
      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import('@capacitor/geolocation');
        watchIdRef.current = await Geolocation.watchPosition(
          WATCH_OPTIONS,
          (position, err) => {
            if (err) {
              setError(`GPS error: ${err.message}`);
              return;
            }
            if (!position) return;
            processPosition(position, lastCoordRef, accumulatedMilesRef, setters);
          }
        );
      } else {
        browserWatchRef.current = navigator.geolocation.watchPosition(
          (position) => processPosition(position, lastCoordRef, accumulatedMilesRef, setters),
          (err) => setError(`GPS error: ${err.message}`),
          WATCH_OPTIONS
        );
      }
    } catch (e) {
      setError(`Could not start GPS: ${e.message}`);
      setTripActive(false);
    }
  }, [requestPermission]);

  const endTrip = useCallback(async () => {
    if (watchIdRef.current !== null) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        await Geolocation.clearWatch({ id: watchIdRef.current });
      } catch { /* ignore */ }
      watchIdRef.current = null;
    }

    if (browserWatchRef.current !== null) {
      navigator.geolocation.clearWatch(browserWatchRef.current);
      browserWatchRef.current = null;
    }

    setTripActive(false);
    setCurrentSpeed(null);

    const finalMiles = Number.parseFloat(accumulatedMilesRef.current.toFixed(1));
    const duration = tripStartTimeRef.current
      ? Math.round((Date.now() - tripStartTimeRef.current.getTime()) / 60000)
      : null;

    return {
      miles: finalMiles,
      durationMinutes: duration,
      endTime: new Date().toISOString()
    };
  }, []);

  useEffect(() => () => {
    if (watchIdRef.current !== null) {
      import('@capacitor/geolocation')
        .then(({ Geolocation }) => Geolocation.clearWatch({ id: watchIdRef.current }))
        .catch(() => {});
    }
    if (browserWatchRef.current !== null) {
      navigator.geolocation.clearWatch(browserWatchRef.current);
    }
  }, []);

  return {
    tripActive,
    tripMiles,
    currentSpeed,
    currentCoords,
    error,
    permissionStatus,
    startTrip,
    endTrip,
    requestPermission
  };
}

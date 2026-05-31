import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { FleetAPI } from '../services/api';

const PING_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 15000 };

async function readPosition() {
  if (Capacitor.isNativePlatform()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const perm = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
    const granted = perm.location === 'granted' || perm.coarseLocation === 'granted';
    if (!granted) throw new Error('Location permission denied');

    return Geolocation.getCurrentPosition(GEO_OPTIONS);
  }

  if (!navigator.geolocation) throw new Error('Location not available');
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS);
  });
}

export function useFleetLocation(userId, fleetEnabled) {
  const [sharing, setSharing] = useState(false);
  const [lastPing, setLastPing] = useState(null);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const storageKey = userId ? `fleet_gps_share_${userId}` : null;

  useEffect(() => {
    if (!storageKey || !fleetEnabled) return;
    const saved = localStorage.getItem(storageKey);
    if (saved === '1') setSharing(true);
  }, [storageKey, fleetEnabled]);

  const pingNow = useCallback(async () => {
    if (!fleetEnabled || isDemo()) return null;
    setError(null);
    try {
      const position = await readPosition();
      const { latitude, longitude, speed, heading } = position.coords;
      const mph = speed != null && speed >= 0 ? Math.round(speed * 2.237) : 0;

      await FleetAPI.postLocation({
        latitude,
        longitude,
        speed: mph,
        heading: heading ?? undefined
      });

      const ping = {
        lat: latitude,
        lng: longitude,
        speed: mph,
        at: new Date().toISOString()
      };
      setLastPing(ping);
      return ping;
    } catch (e) {
      const msg = e.message || 'Could not send location';
      setError(msg);
      return null;
    }
  }, [fleetEnabled]);

  const startSharing = useCallback(async () => {
    const ping = await pingNow();
    if (!ping) return false;
    setSharing(true);
    if (storageKey) localStorage.setItem(storageKey, '1');
    return true;
  }, [pingNow, storageKey]);

  const stopSharing = useCallback(() => {
    setSharing(false);
    if (storageKey) localStorage.setItem(storageKey, '0');
  }, [storageKey]);

  useEffect(() => {
    if (!sharing || !fleetEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return undefined;
    }

    pingNow();
    intervalRef.current = setInterval(pingNow, PING_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sharing, fleetEnabled, pingNow]);

  return {
    sharing,
    lastPing,
    error,
    startSharing,
    stopSharing,
    pingNow,
    isNative: Capacitor.isNativePlatform()
  };
}

function isDemo() {
  return localStorage.getItem('authToken') === 'demo_token_12345';
}

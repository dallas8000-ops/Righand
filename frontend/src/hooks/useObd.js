import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

const OBD_SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
const OBD_WRITE = '0000fff2-0000-1000-8000-00805f9b34fb';
const OBD_NOTIFY = '0000fff1-0000-1000-8000-00805f9b34fb';
const OBD_SERVICE_ALT = '00001101-0000-1000-8000-00805f9b34fb';

const ELM_INIT_COMMANDS = ['ATZ\r', 'ATE0\r', 'ATL0\r', 'ATS0\r', 'ATH0\r', 'ATSP0\r'];

const EMPTY_VEHICLE = {
  speedMph: null,
  rpm: null,
  throttlePct: null,
  fuelPct: null,
  odometerMiles: null
};

function parsePid(pid, responseHex) {
  const clean = responseHex.replace(/\s/g, '');
  const marker = '41' + pid.toUpperCase();
  const idx = clean.indexOf(marker);
  if (idx === -1) return null;
  const data = clean.slice(idx + marker.length);

  switch (pid.toUpperCase()) {
    case '0C': {
      if (data.length < 4) return null;
      const A = Number.parseInt(data.slice(0, 2), 16);
      const B = Number.parseInt(data.slice(2, 4), 16);
      return Math.round(((A * 256) + B) / 4);
    }
    case '0D': {
      if (data.length < 2) return null;
      const kmh = Number.parseInt(data.slice(0, 2), 16);
      return Math.round(kmh * 0.621371);
    }
    case '11': {
      if (data.length < 2) return null;
      return Math.round((Number.parseInt(data.slice(0, 2), 16) * 100) / 255);
    }
    case '2F': {
      if (data.length < 2) return null;
      return Math.round((Number.parseInt(data.slice(0, 2), 16) * 100) / 255);
    }
    case 'A6': {
      if (data.length < 8) return null;
      const km =
        (Number.parseInt(data.slice(0, 2), 16) << 24) +
        (Number.parseInt(data.slice(2, 4), 16) << 16) +
        (Number.parseInt(data.slice(4, 6), 16) << 8) +
        Number.parseInt(data.slice(6, 8), 16);
      return Math.round(km * 0.621371);
    }
    default:
      return null;
  }
}

export function useObd() {
  const [status, setStatus] = useState('idle');
  const [deviceName, setDeviceName] = useState(null);
  const [vehicleData, setVehicleData] = useState(EMPTY_VEHICLE);
  const [error, setError] = useState(null);

  const deviceIdRef = useRef(null);
  const pollingRef = useRef(null);
  const responseBuffer = useRef('');
  const resolveRef = useRef(null);
  const bleClientRef = useRef(null);

  const sendCommand = useCallback(async (cmd) => {
    const BleClient = bleClientRef.current;
    if (!BleClient || !deviceIdRef.current) return null;

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      responseBuffer.current = '';
      const bytes = new Uint8Array([...cmd].map(c => c.charCodeAt(0)));

      const write = (service) =>
        BleClient.write(deviceIdRef.current, service, OBD_WRITE, bytes.buffer);

      write(OBD_SERVICE).catch(() => write(OBD_SERVICE_ALT).catch(() => resolve(null)));

      setTimeout(() => {
        if (resolveRef.current) {
          resolveRef.current(responseBuffer.current);
          resolveRef.current = null;
        }
      }, 1500);
    });
  }, []);

  const onNotification = useCallback((value) => {
    const text = new TextDecoder().decode(value);
    responseBuffer.current += text;
    if (responseBuffer.current.includes('>') && resolveRef.current) {
      resolveRef.current(responseBuffer.current);
      resolveRef.current = null;
    }
  }, []);

  const initElm = useCallback(async () => {
    for (const cmd of ELM_INIT_COMMANDS) {
      await sendCommand(cmd);
      await new Promise(r => setTimeout(r, 300));
    }
  }, [sendCommand]);

  const startPolling = useCallback(() => {
    const pids = ['0D', '0C', '11', '2F', 'A6'];
    let pidIndex = 0;

    pollingRef.current = setInterval(async () => {
      const pid = pids[pidIndex % pids.length];
      pidIndex += 1;

      const response = await sendCommand(`01${pid}\r`);
      if (!response) return;

      const value = parsePid(pid, response);
      if (value === null) return;

      setVehicleData(prev => {
        switch (pid) {
          case '0D': return { ...prev, speedMph: value };
          case '0C': return { ...prev, rpm: value };
          case '11': return { ...prev, throttlePct: value };
          case '2F': return { ...prev, fuelPct: value };
          case 'A6': return { ...prev, odometerMiles: value };
          default: return prev;
        }
      });
    }, 1500);
  }, [sendCommand]);

  const connect = useCallback(async () => {
    setError(null);

    if (!Capacitor.isNativePlatform()) {
      setError('OBD requires the RigHand Android app (Bluetooth not available in browser).');
      setStatus('error');
      return;
    }

    setStatus('scanning');

    try {
      const { BleClient } = await import('@capacitor-community/bluetooth-le');
      bleClientRef.current = BleClient;
      await BleClient.initialize({ androidNeverForLocation: true });

      let foundDevice = null;
      await BleClient.requestLEScan(
        { services: [OBD_SERVICE] },
        (result) => {
          const name = result.localName || result.device?.name || '';
          const lower = name.toLowerCase();
          if (
            lower.includes('obd') ||
            lower.includes('elm') ||
            lower.includes('veepeak') ||
            lower.includes('fixd') ||
            lower.includes('carista')
          ) {
            foundDevice = result.device;
          }
        }
      );

      await new Promise(r => setTimeout(r, 3000));
      await BleClient.stopLEScan();

      if (!foundDevice) {
        foundDevice = await BleClient.requestDevice({
          optionalServices: [OBD_SERVICE, OBD_SERVICE_ALT]
        });
      }

      setStatus('connecting');
      await BleClient.connect(foundDevice.deviceId, () => {
        setStatus('idle');
        setDeviceName(null);
        if (pollingRef.current) clearInterval(pollingRef.current);
      });

      deviceIdRef.current = foundDevice.deviceId;
      setDeviceName(foundDevice.name || 'OBD Adapter');

      await BleClient.startNotifications(
        foundDevice.deviceId,
        OBD_SERVICE,
        OBD_NOTIFY,
        onNotification
      );

      await initElm();
      setStatus('connected');
      startPolling();
    } catch (e) {
      setError(e.message || 'Could not connect to OBD adapter');
      setStatus('error');
    }
  }, [onNotification, initElm, startPolling]);

  const disconnect = useCallback(async () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (deviceIdRef.current && bleClientRef.current) {
      try {
        await bleClientRef.current.disconnect(deviceIdRef.current);
      } catch { /* ignore */ }
      deviceIdRef.current = null;
    }
    setStatus('idle');
    setDeviceName(null);
    setVehicleData(EMPTY_VEHICLE);
  }, []);

  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
  }, []);

  return {
    status,
    deviceName,
    vehicleData,
    error,
    connect,
    disconnect,
    isNative: Capacitor.isNativePlatform()
  };
}

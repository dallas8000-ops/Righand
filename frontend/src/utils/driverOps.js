import { formatCurrency } from './currency';

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const scopedKey = (userId, name) => `righand:${userId || 'demo'}:${name}`;

export const DEFAULT_DRIVER_TARGETS = {
  targetRatePerMile: 2.1,
  targetWeeklyProfit: 1500,
  fuelReserveMiles: 180,
  tankGallons: 120,
  fuelLevelPct: '',
  maintenanceWarningMiles: 1000,
};

export const DriverOpsStore = {
  getLoadPackets(userId) {
    return readJson(scopedKey(userId, 'loadPackets'), []);
  },

  saveLoadPackets(userId, packets) {
    writeJson(scopedKey(userId, 'loadPackets'), packets);
  },

  getMaintenance(userId) {
    return readJson(scopedKey(userId, 'maintenance'), []);
  },

  saveMaintenance(userId, items) {
    writeJson(scopedKey(userId, 'maintenance'), items);
  },

  getTargets(userId) {
    return {
      ...DEFAULT_DRIVER_TARGETS,
      ...readJson(scopedKey(userId, 'targets'), {}),
    };
  },

  saveTargets(userId, targets) {
    writeJson(scopedKey(userId, 'targets'), targets);
  },
};

export const emptyLoadPacket = () => ({
  id: '',
  status: 'planned',
  loadNumber: '',
  broker: '',
  shipper: '',
  receiver: '',
  pickupDate: '',
  deliveryDate: '',
  rate: '',
  loadedMiles: '',
  deadheadMiles: '',
  fuelEstimate: '',
  tolls: '',
  detentionTerms: '',
  lumper: '',
  pickupAddress: '',
  deliveryAddress: '',
  notes: '',
  contractUrl: '',
  bolUrl: '',
  podUrl: '',
});

export const emptyMaintenanceItem = () => ({
  id: '',
  name: 'Oil service',
  dueOdometer: '',
  dueDate: '',
  lastCompletedOdometer: '',
  notes: '',
});

export const computeLoadDecision = (packet, targets = DEFAULT_DRIVER_TARGETS) => {
  const rate = Number(packet.rate) || 0;
  const loaded = Number(packet.loadedMiles) || 0;
  const deadhead = Number(packet.deadheadMiles) || 0;
  const fuel = Number(packet.fuelEstimate) || 0;
  const tolls = Number(packet.tolls) || 0;
  const lumper = Number(packet.lumper) || 0;
  const totalMiles = loaded + deadhead;
  const net = rate - fuel - tolls - lumper;
  const ratePerMile = totalMiles > 0 ? rate / totalMiles : null;
  const netPerMile = totalMiles > 0 ? net / totalMiles : null;
  const target = Number(targets.targetRatePerMile) || DEFAULT_DRIVER_TARGETS.targetRatePerMile;

  let score = 'Need miles';
  if (netPerMile !== null) {
    if (netPerMile >= target) score = 'Take';
    else if (netPerMile >= target * 0.85) score = 'Review';
    else score = 'Pass';
  }

  return { totalMiles, net, ratePerMile, netPerMile, score, target };
};

export const latestOdometer = (expenses) => expenses
  .map(entry => Number(entry.odometer) || 0)
  .filter(Boolean)
  .sort((a, b) => b - a)[0] || null;

const maintenanceOdometerAlert = (item, odometer, warningMiles) => {
  const dueOdo = Number(item.dueOdometer) || 0;
  if (!odometer || !dueOdo) return null;

  const milesLeft = dueOdo - odometer;
  if (milesLeft <= 0) {
    return {
      type: 'maintenance',
      level: 'danger',
      title: `${item.name} overdue`,
      body: `${item.name} is overdue by ${Math.abs(milesLeft).toFixed(0)} miles.`,
    };
  }
  if (milesLeft <= warningMiles) {
    return {
      type: 'maintenance',
      level: 'warning',
      title: `${item.name} due soon`,
      body: `${item.name} due in ${milesLeft.toFixed(0)} miles.`,
    };
  }
  return null;
};

const maintenanceDateAlert = (item) => {
  if (!item.dueDate) return null;

  const daysLeft = Math.ceil((new Date(item.dueDate).getTime() - Date.now()) / 86400000);
  if (daysLeft > 14) return null;

  const dateStatus = daysLeft < 0 ? 'overdue' : 'coming up';
  const dateBody = daysLeft < 0
    ? `${Math.abs(daysLeft)} days overdue`
    : `due in ${daysLeft} days`;
  return {
    type: 'maintenance',
    level: daysLeft < 0 ? 'danger' : 'warning',
    title: `${item.name} date ${dateStatus}`,
    body: `${item.name} is ${dateBody}.`,
  };
};

const collectMaintenanceAlerts = (maintenanceItems, odometer, warningMiles) => (
  maintenanceItems.flatMap(item => [
    maintenanceOdometerAlert(item, odometer, warningMiles),
    maintenanceDateAlert(item),
  ].filter(Boolean))
);

const collectLoadAlerts = (loadPackets, targets, formatMoney) => {
  const followUpAlerts = loadPackets
    .filter(packet => packet.status !== 'paid' && packet.deliveryDate)
    .filter(packet => Math.floor((Date.now() - new Date(packet.deliveryDate).getTime()) / 86400000) >= 5)
    .map(packet => {
      const daysSinceDelivery = Math.floor((Date.now() - new Date(packet.deliveryDate).getTime()) / 86400000);
      return {
        type: 'load',
        level: 'warning',
        title: 'Broker payment follow-up',
        body: `${packet.broker || 'Broker'} payment is ${daysSinceDelivery} days past delivery on load ${packet.loadNumber || packet.shipper || 'packet'}.`,
      };
    });

  const packetAlerts = loadPackets.flatMap(packet => {
    const alerts = [];
    const decision = computeLoadDecision(packet, targets);
    if (decision.netPerMile !== null && decision.netPerMile < decision.target) {
      alerts.push({
        type: 'load',
        level: decision.score === 'Pass' ? 'danger' : 'warning',
        title: `Load pays ${formatMoney(decision.netPerMile)}/mi`,
        body: `Target is ${formatMoney(decision.target)}/mi after fuel, tolls, deadhead, and lumper.`,
      });
    }
    if (packet.pickupDate && packet.deliveryDate && new Date(packet.deliveryDate) < new Date(packet.pickupDate)) {
      alerts.push({
        type: 'load',
        level: 'danger',
        title: 'Delivery before pickup',
        body: 'Check pickup and delivery dates on the load packet.',
      });
    }
    return alerts;
  });

  return [...followUpAlerts, ...packetAlerts];
};

export const analyzeDriverOps = ({ expenses, loadPackets, maintenanceItems, targets, weeklyDays, formatMoney = (value) => formatCurrency(value, 'USD') }) => {
  const alerts = [];
  const fuelEntries = expenses
    .filter(e => e.type === 'expense' && e.category === 'fuel')
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const odometer = latestOdometer(expenses);

  fuelEntries.slice(0, 8).forEach(entry => {
    if ((Number(entry.gallons) || 0) > 0 && !entry.fuelState) {
      alerts.push({
        type: 'ifta',
        level: 'warning',
        title: 'Fuel state missing',
        body: `You entered ${Number(entry.gallons).toFixed(1)} gallons without a fuel state. Add state for IFTA.`,
      });
    }
    if ((Number(entry.gallons) || 0) <= 0) {
      alerts.push({
        type: 'ifta',
        level: 'warning',
        title: 'Fuel gallons missing',
        body: 'Fuel entries need gallons for IFTA and MPG records.',
      });
    }
  });

  const sortedFuelWithOdo = fuelEntries
    .filter(e => Number(e.odometer) > 0)
    .sort((a, b) => Number(b.odometer) - Number(a.odometer));
  if (sortedFuelWithOdo.length >= 2) {
    const gap = Number(sortedFuelWithOdo[0].odometer) - Number(sortedFuelWithOdo[1].odometer);
    if (gap > 550) {
      alerts.push({
        type: 'fuel',
        level: 'warning',
        title: 'Fuel log may be missing',
        body: `You drove ${gap.toFixed(0)} miles between fuel odometers. Check for a missing fuel stop.`,
      });
    }
  }

  const mpgReadings = sortedFuelWithOdo
    .map((entry, index, list) => {
      const previous = list[index + 1];
      if (!previous || !entry.gallons) return null;
      const miles = Number(entry.odometer) - Number(previous.odometer);
      const gallons = Number(entry.gallons);
      return miles > 0 && gallons > 0 ? miles / gallons : null;
    })
    .filter(Boolean);
  if (mpgReadings.length >= 3) {
    const latest = mpgReadings[0];
    const average = mpgReadings.slice(1, 4).reduce((sum, mpg) => sum + mpg, 0) / Math.min(3, mpgReadings.length - 1);
    if (latest < average * 0.82) {
      alerts.push({
        type: 'fuel',
        level: 'warning',
        title: 'MPG dropped',
        body: `Fuel MPG dropped from ${average.toFixed(1)} to ${latest.toFixed(1)}. Check idle time, load weight, tires, or route.`,
      });
    }
  }

  if (mpgReadings.length && targets.fuelLevelPct !== '' && Number(targets.tankGallons) > 0) {
    const estimatedRange = (Number(targets.tankGallons) * (Number(targets.fuelLevelPct) / 100)) * mpgReadings[0];
    if (estimatedRange <= targets.fuelReserveMiles) {
      alerts.push({
        type: 'fuel',
        level: 'warning',
        title: 'Fuel range getting low',
        body: `At current MPG and fuel level, estimated range is ${estimatedRange.toFixed(0)} miles.`,
      });
    }
  }

  const weeklyProfit = weeklyDays.reduce((sum, day) => sum + (Number(day.net) || 0), 0);
  if (weeklyProfit < targets.targetWeeklyProfit) {
    alerts.push({
      type: 'profit',
      level: 'info',
      title: 'Weekly profit target',
      body: `You are at ${formatMoney(weeklyProfit)} this week against a ${formatMoney(targets.targetWeeklyProfit)} target.`,
    });
  }

  return [
    ...alerts,
    ...collectMaintenanceAlerts(maintenanceItems, odometer, targets.maintenanceWarningMiles),
    ...collectLoadAlerts(loadPackets, targets, formatMoney),
  ].slice(0, 8);
};

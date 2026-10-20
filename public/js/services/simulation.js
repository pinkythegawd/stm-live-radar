/**
 * Fallback simulation — a realistic, deterministic STM network for when the
 * live feed is unreachable (offline, CORS, rate limit or missing API key).
 *
 * Buses travel along simplified but geographically faithful corridors across
 * the West Island, Downtown, LaSalle, Lachine, Côte-Vertu and Pie-IX. Fleet
 * numbers, headings, speeds, occupancy and GPS ages all behave like the live
 * feed so every dashboard feature can be exercised without a network.
 */

import { haversineMeters, polylineLength, pointAlongPolyline } from '../utils/geo.js';
import { t } from '../i18n.js';

const OCCUPANCY_SPREAD = [
  'MANY_SEATS_AVAILABLE', 'MANY_SEATS_AVAILABLE', 'MANY_SEATS_AVAILABLE',
  'FEW_SEATS_AVAILABLE', 'FEW_SEATS_AVAILABLE',
  'STANDING_ROOM_ONLY', 'STANDING_ROOM_ONLY',
  'FULL', 'EMPTY', 'NO_DATA_AVAILABLE',
];

const OCCUPANCY_LABELS = {
  EMPTY: 'Empty',
  MANY_SEATS_AVAILABLE: 'Many seats available',
  FEW_SEATS_AVAILABLE: 'Few seats available',
  STANDING_ROOM_ONLY: 'Standing room only',
  CRUSHED_STANDING_ROOM_ONLY: 'Crushed standing room',
  FULL: 'Full',
  NOT_ACCEPTING_PASSENGERS: 'Not accepting passengers',
  NO_DATA_AVAILABLE: 'No occupancy data',
  NOT_BOARDABLE: 'Not boardable',
};

const ROUTE_DEFS = [
  {
    id: '215', name: 'Pointe-Claire', buses: 6,
    headsigns: ['Est · Côte-Vertu', 'Ouest · Pointe-Claire'],
    points: [
      [45.5145, -73.6782], [45.5005, -73.6960], [45.4890, -73.7250],
      [45.4760, -73.7520], [45.4675, -73.7800], [45.4580, -73.8030], [45.4470, -73.8160],
    ],
  },
  {
    id: '409', name: 'Express des Sources', buses: 6,
    headsigns: ['Est · Côte-Vertu', 'Ouest · Des Sources'],
    points: [
      [45.5145, -73.6782], [45.5020, -73.7200], [45.4880, -73.7700],
      [45.4720, -73.8100], [45.4640, -73.8320],
    ],
  },
  {
    id: '470', name: 'Express Pierrefonds', buses: 5,
    headsigns: ['Est · Côte-Vertu', 'Ouest · Fairview'],
    points: [
      [45.5145, -73.6782], [45.5050, -73.7300], [45.4950, -73.7900],
      [45.4880, -73.8500], [45.4800, -73.8800],
    ],
  },
  {
    id: '211', name: 'Bord-du-Lac', buses: 6,
    headsigns: ['Est · Angrignon', 'Ouest · Pointe-Claire'],
    points: [
      [45.4465, -73.6025], [45.4380, -73.6350], [45.4310, -73.6650], [45.4280, -73.6950],
      [45.4360, -73.7300], [45.4460, -73.7650], [45.4460, -73.8000], [45.4440, -73.8300],
    ],
  },
  {
    id: '191', name: 'Broadway', buses: 4,
    headsigns: ['Nord · LachineNord', 'Sud · Lachine'],
    points: [
      [45.4280, -73.6950], [45.4350, -73.6850], [45.4430, -73.6780],
      [45.4500, -73.6700], [45.4560, -73.6650],
    ],
  },
  {
    id: '90', name: 'Saint-Jacques', buses: 5,
    headsigns: ['Est · Atwater', 'Ouest · Lachine'],
    points: [
      [45.4720, -73.6050], [45.4600, -73.6300], [45.4480, -73.6550],
      [45.4350, -73.6750], [45.4250, -73.6900],
    ],
  },
  {
    id: '110', name: 'Centrale', buses: 5,
    headsigns: ['Nord · Angrignon', 'Sud · LaSalle'],
    points: [
      [45.4465, -73.6025], [45.4340, -73.6100], [45.4260, -73.6350],
      [45.4230, -73.6600], [45.4300, -73.6750],
    ],
  },
  {
    id: '24', name: 'Sherbrooke', buses: 7,
    headsigns: ['Est · Pie-IX', 'Ouest · Westmount'],
    points: [
      [45.5530, -73.5450], [45.5350, -73.5550], [45.5200, -73.5650], [45.5080, -73.5720],
      [45.4970, -73.5790], [45.4880, -73.5900], [45.4780, -73.6050],
    ],
  },
  {
    id: '15', name: 'Sainte-Catherine', buses: 6,
    headsigns: ['Est · Papineau', 'Ouest · Atwater'],
    points: [
      [45.5150, -73.5500], [45.5100, -73.5630], [45.5060, -73.5720],
      [45.5010, -73.5800], [45.4960, -73.5900], [45.4920, -73.6000],
    ],
  },
  {
    id: '747', name: 'YUL Aéroport Montréal-Trudeau', buses: 6,
    headsigns: ['Est · Centre-ville', 'Ouest · YUL Airport'],
    points: [
      [45.5150, -73.5600], [45.5080, -73.5680], [45.5000, -73.5750], [45.4890, -73.5840],
      [45.4740, -73.6000], [45.4650, -73.6400], [45.4620, -73.6900], [45.4660, -73.7350],
    ],
  },
  {
    id: '80', name: 'Du Parc', buses: 6,
    headsigns: ['Sud · Place-des-Arts', 'Nord · Marché Central'],
    points: [
      [45.5040, -73.5740], [45.5150, -73.5730], [45.5250, -73.5720],
      [45.5350, -73.5700], [45.5470, -73.5680], [45.5580, -73.5700],
    ],
  },
  {
    id: '51', name: 'Édouard-Montpetit', buses: 4,
    headsigns: ['Est · Laurier', 'Ouest · Snowdon'],
    points: [
      [45.5030, -73.5820], [45.5100, -73.5950], [45.5150, -73.6100],
      [45.5200, -73.6250], [45.5230, -73.6400], [45.5280, -73.6500],
    ],
  },
  {
    id: '165', name: 'Côte-des-Neiges', buses: 6,
    headsigns: ['Sud · Guy-Concordia', 'Nord · Côte-des-Neiges'],
    points: [
      [45.4980, -73.5790], [45.5020, -73.5900], [45.5070, -73.6020], [45.5130, -73.6150],
      [45.5200, -73.6280], [45.5280, -73.6380], [45.5380, -73.6450],
    ],
  },
  {
    id: '121', name: 'Sauvé / Côte-Vertu', buses: 4,
    headsigns: ['Sud · Côte-Vertu', 'Nord · Sauvé'],
    points: [
      [45.5145, -73.6782], [45.5220, -73.6720], [45.5310, -73.6650],
      [45.5410, -73.6580], [45.5510, -73.6520],
    ],
  },
  {
    id: '171', name: 'Henri-Bourassa', buses: 5,
    headsigns: ['Sud · Côte-Vertu', 'Nord · Henri-Bourassa'],
    points: [
      [45.5145, -73.6782], [45.5250, -73.6740], [45.5380, -73.6680],
      [45.5520, -73.6580], [45.5680, -73.6480], [45.5820, -73.6400],
    ],
  },
  {
    id: '139', name: 'Pie-IX', buses: 7,
    headsigns: ['Sud · Notre-Dame', 'Nord · Pie-IX / Laval'],
    points: [
      [45.5070, -73.6020], [45.5250, -73.5980], [45.5410, -73.5940], [45.5560, -73.5900],
      [45.5720, -73.5860], [45.5880, -73.5820], [45.6040, -73.5780],
    ],
  },
  {
    id: '439', name: 'Express Pie-IX', buses: 6,
    headsigns: ['Sud · Pie-IX', 'Nord · Laval'],
    points: [
      [45.5200, -73.5990], [45.5400, -73.5940], [45.5600, -73.5890],
      [45.5800, -73.5840], [45.6000, -73.5790], [45.6150, -73.5750],
    ],
  },
  {
    id: '141', name: 'Jean-Talon Est', buses: 5,
    headsigns: ['Ouest · Jean-Talon', 'Est · Saint-Michel'],
    points: [
      [45.5580, -73.6000], [45.5580, -73.5800], [45.5570, -73.5600],
      [45.5560, -73.5400], [45.5540, -73.5200],
    ],
  },
  {
    id: '97', name: 'Mont-Royal', buses: 4,
    headsigns: ['Ouest · Mont-Royal', 'Est · Frontenac'],
    points: [
      [45.5230, -73.5980], [45.5250, -73.5850], [45.5270, -73.5720],
      [45.5290, -73.5600], [45.5310, -73.5470],
    ],
  },
  {
    id: '105', name: 'Sherbrooke', buses: 4,
    headsigns: ['Est · Guy-Concordia', 'Ouest · NDG'],
    points: [
      [45.4680, -73.6330], [45.4740, -73.6220], [45.4820, -73.6100],
      [45.4900, -73.5980], [45.4970, -73.5870], [45.5030, -73.5770],
    ],
  },
  {
    id: '168', name: 'Cité-du-Havre', buses: 4,
    headsigns: ['Nord · Jean-Drapeau', 'Sud · Cité-du-Havre'],
    points: [
      [45.4900, -73.5480], [45.4950, -73.5400], [45.5000, -73.5350],
      [45.5050, -73.5300], [45.5080, -73.5250],
    ],
  },
  {
    id: '356', name: 'Lachine / LaSalle', buses: 4,
    headsigns: ['Est · Centre-ville', 'Ouest · Lachine'],
    points: [
      [45.5080, -73.5680], [45.4900, -73.5900], [45.4700, -73.6200],
      [45.4500, -73.6500], [45.4300, -73.6750], [45.4250, -73.7000],
    ],
  },
  {
    id: '361', name: 'Saint-Denis', buses: 4,
    headsigns: ['Sud · Centre-ville', 'Nord · Saint-Denis'],
    points: [
      [45.4950, -73.5720], [45.5100, -73.5650], [45.5250, -73.5600],
      [45.5400, -73.5550], [45.5550, -73.5500], [45.5700, -73.5450],
    ],
  },
  {
    id: '376', name: 'Pierrefonds', buses: 4,
    headsigns: ['Est · Côte-Vertu', 'Ouest · Pierrefonds'],
    points: [
      [45.5145, -73.6782], [45.5050, -73.7300], [45.4950, -73.7900],
      [45.4850, -73.8500], [45.4780, -73.8900],
    ],
  },
  {
    id: '777', name: 'Casino / Parc Jean-Drapeau', buses: 3,
    headsigns: ['Ouest · Vieux-Port', 'Est · Casino'],
    points: [
      [45.5080, -73.5520], [45.5060, -73.5400], [45.5040, -73.5300], [45.5030, -73.5240],
    ],
  },
  {
    id: '715', name: 'Vieux-Port shuttle', buses: 3,
    headsigns: ['Ouest · Vieux-Port', 'Est · Quai Jacques-Cartier'],
    points: [
      [45.5000, -73.5560], [45.5050, -73.5520], [45.5080, -73.5580], [45.5030, -73.5620],
    ],
  },
];

function categoryFor(routeId) {
  const n = Number.parseInt(routeId, 10);
  if (n >= 700) return { key: 'shuttle', color: '#f59e0b' };
  if (n >= 400) return { key: 'express', color: '#a855f7' };
  if (n >= 300) return { key: 'night', color: '#6366f1' };
  if (n >= 250) return { key: 'shuttle', color: '#f59e0b' };
  return { key: 'local', color: '#009ee0' };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0x5eed2026);

const ROUTES = ROUTE_DEFS.map((def) => {
  const points = def.points.map(([lat, lng]) => ({ lat, lng }));
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1] + haversineMeters(points[i - 1], points[i]));
  }
  return {
    ...def,
    points,
    cumulative,
    total: polylineLength(points),
    category: categoryFor(def.id),
  };
});

const FLEET_PREFIXES = [24, 29, 30, 31, 39, 40, 41, 44];

function makeFleet(index) {
  const prefix = FLEET_PREFIXES[index % FLEET_PREFIXES.length];
  const suffix = (index * 137 + 4242 + Math.floor(rng() * 500)) % 1000;
  return String(prefix * 1000 + suffix);
}

const BUSES = [];
let fleetIndex = 0;

for (let routeIndex = 0; routeIndex < ROUTES.length; routeIndex += 1) {
  const route = ROUTES[routeIndex];
  for (let i = 0; i < route.buses; i += 1) {
    const direction = rng() < 0.5 ? 1 : -1;
    const progress = (i + rng() * 0.8) / route.buses;
    const along = Math.min(route.total - 1, Math.max(1, progress * route.total));
    BUSES.push({
      fleet: makeFleet(fleetIndex),
      routeIndex,
      along,
      direction,
      cruiseSpeed: 15 + rng() * 33,
      speed: 0,
      occupancy: OCCUPANCY_SPREAD[Math.floor(rng() * OCCUPANCY_SPREAD.length)],
      dwellUntil: 0,
      pingOffset: fleetIndex % 8,
      swaySeed: rng() * Math.PI * 2,
    });
    fleetIndex += 1;
  }
}

let lastTick = 0;
let tickCount = 0;

function updateBus(bus, dtSeconds, nowMs) {
  const route = ROUTES[bus.routeIndex];

  if (bus.dwellUntil > nowMs) {
    bus.speed = Math.max(0, bus.speed - dtSeconds * 12);
    return;
  }

  // Gentle traffic oscillation around the cruise speed.
  const target = bus.cruiseSpeed * (0.78 + 0.22 * Math.abs(Math.sin(tickCount / 9 + bus.swaySeed)));
  bus.speed += (target - bus.speed) * Math.min(1, dtSeconds / 3.2);
  bus.speed = Math.max(0, Math.min(58, bus.speed));

  bus.along += bus.direction * (bus.speed / 3.6) * dtSeconds;

  if (bus.along >= route.total) {
    bus.along = Math.max(0, route.total - (bus.along - route.total));
    bus.direction = -1;
    bus.dwellUntil = nowMs + 2500 + rng() * 5000;
    bus.speed = 0;
  } else if (bus.along <= 0) {
    bus.along = Math.min(route.total, Math.abs(bus.along));
    bus.direction = 1;
    bus.dwellUntil = nowMs + 2500 + rng() * 5000;
    bus.speed = 0;
  }

  // Small occupancy changes keep the dashboard feeling alive.
  if (rng() > 0.985) {
    bus.occupancy = OCCUPANCY_SPREAD[Math.floor(rng() * OCCUPANCY_SPREAD.length)];
  }
}

/**
 * Advance the simulation and return a fresh snapshot.
 * Safe to call at any cadence: elapsed real time is used.
 */
export function getVehicles() {
  const now = Date.now();
  const dt = lastTick ? Math.min(45, Math.max(0, (now - lastTick) / 1000)) : 0;
  lastTick = now;
  tickCount += 1;

  for (const bus of BUSES) updateBus(bus, dt, now);
  if (tickCount % 20 === 0) {
    // Refresh the fleet seed slowly so long sessions still evolve.
    fleetIndex = (fleetIndex + 1) % 100000;
  }

  const nowSeconds = Math.floor(now / 1000);

  return BUSES.map((bus) => {
    const route = ROUTES[bus.routeIndex];
    const point = pointAlongPolyline(route.points, route.cumulative, route.total, bus.along);
    const bearing = (point.bearing + (bus.direction < 0 ? 180 : 0) + 360) % 360;
    const jitterLat = (rng() - 0.5) * 0.00006;
    const jitterLng = (rng() - 0.5) * 0.00006;
    const headsign = route.headsigns[bus.direction > 0 ? 0 : 1];
    const speed = Math.round(bus.speed * 10) / 10;

    return {
      vehicleId: bus.fleet,
      routeId: route.id,
      routeName: route.name,
      tripHeadsign: headsign,
      direction: headsign,
      directionId: bus.direction > 0 ? 0 : 1,
      latitude: Math.round((point.lat + jitterLat) * 1e6) / 1e6,
      longitude: Math.round((point.lng + jitterLng) * 1e6) / 1e6,
      bearing,
      compass: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearing / 45) % 8],
      speedKmh: speed,
      occupancy: bus.occupancy,
      occupancyLabel: OCCUPANCY_LABELS[bus.occupancy],
      timestamp: nowSeconds - bus.pingOffset,
      tripId: `SIM-${route.id}-${bus.fleet}`,
      currentStatus: speed > 1 ? 'IN_TRANSIT_TO' : 'STOPPED_AT',
      stopId: null,
      category: route.category.key,
      color: route.category.color,
      source: 'simulation',
    };
  });
}

/** A handful of plausible advisories for offline demo mode. */
export function getAlerts() {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      id: 'sim-alert-1',
      title: t('sim.titleLine'),
      description: t('sim.body1'),
      routes: ['139'],
      stops: [],
      severity: 'warning',
      start: now - 3600 * 8,
      end: null,
    },
    {
      id: 'sim-alert-2',
      title: t('sim.titleLine'),
      description: t('sim.body2'),
      routes: ['747'],
      stops: [],
      severity: 'info',
      start: now - 3600 * 3,
      end: null,
    },
    {
      id: 'sim-alert-3',
      title: t('sim.titleStop'),
      description: t('sim.body3'),
      routes: ['24'],
      stops: ['51860'],
      severity: 'warning',
      start: now - 3600 * 26,
      end: null,
    },
    {
      id: 'sim-alert-4',
      title: t('sim.titleLine'),
      description: t('sim.body4'),
      routes: ['356', '361', '376'],
      stops: [],
      severity: 'info',
      start: now - 3600 * 1,
      end: null,
    },
  ];
}

export const SIMULATION_ROUTE_COUNT = ROUTES.length;

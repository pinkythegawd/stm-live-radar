'use strict';

/**
 * GTFS-Realtime v2 decoder (the subset STM publishes).
 *
 * STM exposes two protobuf feeds:
 *   /pub/od/gtfs-rt/ic/v2/vehiclePositions
 *   /pub/od/gtfs-rt/ic/v2/tripUpdates
 *
 * This module turns the binary feed into plain objects. It intentionally reads
 * fields by number, exactly as defined by the public GTFS-Realtime proto, so
 * it keeps working if STM adds new fields.
 */

const {
  parseFields,
  text,
  number,
  message,
  repeatedMessages,
  first,
} = require('./protobuf');

const OCCUPANCY = {
  0: 'EMPTY',
  1: 'MANY_SEATS_AVAILABLE',
  2: 'FEW_SEATS_AVAILABLE',
  3: 'STANDING_ROOM_ONLY',
  4: 'CRUSHED_STANDING_ROOM_ONLY',
  5: 'FULL',
  6: 'NOT_ACCEPTING_PASSENGERS',
  7: 'NO_DATA_AVAILABLE',
  8: 'NOT_BOARDABLE',
};

const VEHICLE_STOP_STATUS = {
  0: 'INCOMING_AT',
  1: 'STOPPED_AT',
  2: 'IN_TRANSIT_TO',
};

const CONGESTION_LEVEL = {
  0: 'UNKNOWN_CONGESTION_LEVEL',
  1: 'RUNNING_SMOOTHLY',
  2: 'STOP_AND_GO',
  3: 'CONGESTION',
  4: 'SEVERE_CONGESTION',
};

function decodeTripDescriptor(buf) {
  if (!buf) return null;
  const f = parseFields(buf);
  return {
    tripId: text(f, 1) || null,
    startTime: text(f, 2) || null,
    startDate: text(f, 3) || null,
    routeId: text(f, 5) || null,
    directionId: number(f, 6) ?? null,
    scheduleRelationship: number(f, 4) ?? 0,
  };
}

function decodeVehicleDescriptor(buf) {
  if (!buf) return null;
  const f = parseFields(buf);
  return {
    id: text(f, 1) || null,
    label: text(f, 2) || null,
    licensePlate: text(f, 3) || null,
  };
}

function decodePosition(buf) {
  if (!buf) return null;
  const f = parseFields(buf);
  return {
    latitude: number(f, 1) ?? null,
    longitude: number(f, 2) ?? null,
    bearing: number(f, 3) ?? null,
    odometer: number(f, 4) ?? null,
    speed: number(f, 5) ?? null, // metres per second in GTFS-RT
  };
}

function decodeVehiclePosition(buf) {
  const f = parseFields(buf);
  const tripBuf = first(f, 1);
  const posBuf = first(f, 2);
  const vehicleBuf = first(f, 8);

  return {
    trip: Buffer.isBuffer(tripBuf) ? decodeTripDescriptor(tripBuf) : null,
    position: Buffer.isBuffer(posBuf) ? decodePosition(posBuf) : null,
    vehicle: Buffer.isBuffer(vehicleBuf) ? decodeVehicleDescriptor(vehicleBuf) : null,
    currentStopSequence: number(f, 3) ?? null,
    stopId: text(f, 7) || null,
    currentStatus: VEHICLE_STOP_STATUS[number(f, 4) ?? -1] || null,
    timestamp: number(f, 5) ?? null,
    congestionLevel: CONGESTION_LEVEL[number(f, 6) ?? -1] || null,
    occupancyStatus: OCCUPANCY[number(f, 9) ?? -1] || null,
  };
}

function decodeTripUpdate(buf) {
  const f = parseFields(buf);
  const tripBuf = first(f, 1);
  const vehicleBuf = first(f, 8);
  return {
    trip: Buffer.isBuffer(tripBuf) ? decodeTripDescriptor(tripBuf) : null,
    vehicle: Buffer.isBuffer(vehicleBuf) ? decodeVehicleDescriptor(vehicleBuf) : null,
    timestamp: number(f, 4) ?? null,
    delay: number(f, 5) ?? null,
  };
}

/**
 * @param {Map<number, unknown[]>} f Parsed FeedEntity fields.
 */
function decodeEntity(f) {
  const vehicleBuf = first(f, 4);
  const tripUpdateBuf = first(f, 3);
  const alertBuf = first(f, 5);

  return {
    id: text(f, 1) || null,
    isDeleted: number(f, 2) === 1,
    vehicle: Buffer.isBuffer(vehicleBuf) ? decodeVehiclePosition(vehicleBuf) : null,
    tripUpdate: Buffer.isBuffer(tripUpdateBuf) ? decodeTripUpdate(tripUpdateBuf) : null,
    hasAlert: Buffer.isBuffer(alertBuf),
  };
}

/**
 * Decode a complete GTFS-Realtime FeedMessage.
 * @param {Buffer} buf
 * @returns {{ header: object, entities: object[] }}
 */
function decodeFeed(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    throw new Error('Empty GTFS-Realtime payload');
  }

  const root = parseFields(buf);
  const headerFields = message(root, 1);
  const header = {
    gtfsRealtimeVersion: headerFields ? text(headerFields, 1) : null,
    incrementality: headerFields ? number(headerFields, 2) : null,
    timestamp: headerFields ? number(headerFields, 3) : null,
  };

  const entities = repeatedMessages(root, 2).map(decodeEntity);
  return { header, entities };
}

module.exports = {
  decodeFeed,
  OCCUPANCY,
  VEHICLE_STOP_STATUS,
  CONGESTION_LEVEL,
};

'use strict';

/**
 * Developer utility: fetch STM's live GTFS-Realtime feed and print a decoded
 * sample. Usage: node server/tools/inspect-feed.js [STM_API_KEY]
 */

const { decodeFeed } = require('../lib/gtfsRt');

const key = process.argv[2] || process.env.STM_API_KEY;
if (!key) {
  console.error('Provide STM_API_KEY as an argument or environment variable.');
  process.exit(1);
}

async function main() {
  const res = await fetch('https://api.stm.info/pub/od/gtfs-rt/ic/v2/vehiclePositions', {
    headers: { apiKey: key, Accept: 'application/x-protobuf' },
  });
  console.log('HTTP', res.status, res.headers.get('content-type'));
  const buf = Buffer.from(await res.arrayBuffer());
  const feed = decodeFeed(buf);
  console.log('Header:', feed.header);
  console.log('Entities:', feed.entities.length);
  console.log('First 3 vehicles:');
  console.log(JSON.stringify(feed.entities.slice(0, 3), null, 2));

  const withRoute = feed.entities.filter((e) => e.vehicle?.trip?.routeId).length;
  const withTrip = feed.entities.filter((e) => e.vehicle?.trip?.tripId).length;
  const withDir = feed.entities.filter((e) => e.vehicle?.trip?.directionId !== null && e.vehicle?.trip?.directionId !== undefined).length;
  const withVehicle = feed.entities.filter((e) => e.vehicle?.vehicle?.id).length;
  const withOccupancy = feed.entities.filter((e) => e.vehicle?.occupancyStatus).length;
  console.log({ withRoute, withTrip, withDir, withVehicle, withOccupancy });
  console.log('Sample ids:', feed.entities.slice(0, 8).map((e) => e.id));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

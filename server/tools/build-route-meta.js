'use strict';

/**
 * Builds `server/data/route-meta.json` from STM's public GTFS static archive.
 *
 * The realtime feed identifies trips by route_id + direction_id but does not
 * carry a headsign. This script extracts the most common headsign for every
 * route/direction pair so the dashboard can display authentic destinations.
 *
 * Usage: node server/tools/build-route-meta.js [path-to-gtfs_stm.zip]
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const GTFS_URL = 'https://www.stm.info/sites/default/files/gtfs/gtfs_stm.zip';
const OUT_FILE = path.join(__dirname, '..', 'data', 'route-meta.json');
const CACHE_FILE = path.join(__dirname, '..', 'data', 'gtfs_stm.zip');

/** Locate the End Of Central Directory record. */
function findEocd(buf) {
  const min = Math.max(0, buf.length - 66_000);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('ZIP end-of-central-directory record not found');
}

/** Return [{ name, method, compressedSize, size, localOffset }] from a ZIP buffer. */
function readCentralDirectory(buf) {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = [];

  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid central directory entry at ${offset}`);
    }
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const size = buf.readUInt32LE(offset + 24);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.push({ name, method, compressedSize, size, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extractEntry(buf, entry) {
  const local = entry.localOffset;
  if (buf.readUInt32LE(local) !== 0x04034b50) {
    throw new Error(`Invalid local header for ${entry.name}`);
  }
  const nameLength = buf.readUInt16LE(local + 26);
  const extraLength = buf.readUInt16LE(local + 28);
  const start = local + 30 + nameLength + extraLength;
  const raw = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
}

/** RFC 4180-ish CSV parser (handles quoted fields and CRLF). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function rowsToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
  return rows.slice(1).filter((r) => r.length > 1).map((r) => {
    const obj = {};
    header.forEach((key, idx) => { obj[key] = r[idx] ?? ''; });
    return obj;
  });
}

async function loadArchive() {
  if (fs.existsSync(CACHE_FILE)) {
    console.log(`Using cached archive ${CACHE_FILE}`);
    return fs.readFileSync(CACHE_FILE);
  }
  console.log(`Downloading ${GTFS_URL} ...`);
  const res = await fetch(GTFS_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, buf);
  console.log(`Downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
  return buf;
}

async function main() {
  const custom = process.argv[2];
  let archive;
  if (custom) {
    archive = fs.readFileSync(custom);
  } else {
    archive = await loadArchive();
  }

  const entries = readCentralDirectory(archive);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const tripsEntry = byName.get('trips.txt');
  const routesEntry = byName.get('routes.txt');
  if (!tripsEntry || !routesEntry) throw new Error('trips.txt or routes.txt missing from archive');

  const trips = rowsToObjects(extractEntry(archive, tripsEntry).toString('utf8'));
  const routes = rowsToObjects(extractEntry(archive, routesEntry).toString('utf8'));

  const routeInfo = new Map();
  for (const route of routes) {
    routeInfo.set(route.route_id, {
      shortName: route.route_short_name,
      longName: route.route_long_name,
      type: Number(route.route_type),
      color: route.route_color ? `#${route.route_color}` : null,
      textColor: route.route_text_color ? `#${route.route_text_color}` : null,
    });
  }

  // route_id -> direction_id -> headsign -> count
  const tally = new Map();
  for (const trip of trips) {
    const routeId = trip.route_id;
    const direction = trip.direction_id || '0';
    const headsign = (trip.trip_headsign || '').trim();
    if (!routeId || !headsign) continue;
    if (!tally.has(routeId)) tally.set(routeId, new Map());
    const directions = tally.get(routeId);
    if (!directions.has(direction)) directions.set(direction, new Map());
    const heads = directions.get(direction);
    heads.set(headsign, (heads.get(headsign) || 0) + 1);
  }

  const output = {};
  for (const [routeId, directions] of tally) {
    const info = routeInfo.get(routeId) || {};
    const dirs = {};
    for (const [direction, heads] of directions) {
      const ranked = [...heads.entries()].sort((a, b) => b[1] - a[1]);
      dirs[direction] = {
        headsign: ranked[0][0],
        variants: ranked.slice(0, 4).map(([name, count]) => ({ name, count })),
      };
    }
    output[routeId] = {
      shortName: info.shortName || routeId,
      longName: info.longName || '',
      type: info.type ?? 3,
      color: info.color,
      textColor: info.textColor,
      directions: dirs,
    };
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: GTFS_URL,
    tripCount: trips.length,
    routeCount: Object.keys(output).length,
    routes: output,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload));
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`Routes: ${payload.routeCount}, trips scanned: ${payload.tripCount}`);
  const preview = ['36', '139', '215', '409', '496', '747'];
  for (const id of preview) {
    if (output[id]) console.log(id, JSON.stringify(output[id].directions));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

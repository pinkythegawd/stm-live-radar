'use strict';

/**
 * Minimal, dependency-free Protocol Buffers wire-format reader.
 *
 * Only the generic wire types are decoded here. GTFS-Realtime field semantics
 * live in `gtfsRt.js`, which keeps this file reusable for any protobuf payload.
 */

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH = 2;
const WIRE_FIXED32 = 5;

class ProtobufError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProtobufError';
  }
}

/**
 * Read an unsigned LEB128 varint from `buf` starting at `offset`.
 * Returns { value: number|bigint, offset }.
 */
function readVarint(buf, offset) {
  let result = 0n;
  let shift = 0n;
  let cursor = offset;

  while (cursor < buf.length) {
    const byte = buf[cursor];
    result |= BigInt(byte & 0x7f) << shift;
    cursor += 1;
    if ((byte & 0x80) === 0) {
      // Stay in the safe integer range whenever possible.
      const numeric = Number(result);
      return {
        value: Number.isSafeInteger(numeric) ? numeric : result,
        offset: cursor,
      };
    }
    shift += 7n;
    if (shift > 70n) throw new ProtobufError('Varint is too long');
  }

  throw new ProtobufError('Unexpected end of buffer while reading varint');
}

/**
 * Parse a protobuf message into a map of field number -> array of raw values.
 * Values are numbers (varint / 32-bit), Buffers (length-delimited) or numbers
 * for fixed 64-bit fields. Unknown fields are preserved, which makes this
 * tolerant of vendor extensions in STM's feed.
 */
function parseFields(buf) {
  const fields = new Map();
  let offset = 0;

  const push = (fieldNumber, value) => {
    if (!fields.has(fieldNumber)) fields.set(fieldNumber, []);
    fields.get(fieldNumber).push(value);
  };

  while (offset < buf.length) {
    const key = readVarint(buf, offset);
    offset = key.offset;
    const fieldNumber = Number(key.value) >>> 3;
    const wireType = Number(key.value) & 0x07;
    if (fieldNumber === 0) throw new ProtobufError('Invalid field number 0');

    switch (wireType) {
      case WIRE_VARINT: {
        const v = readVarint(buf, offset);
        offset = v.offset;
        push(fieldNumber, v.value);
        break;
      }
      case WIRE_FIXED64: {
        if (offset + 8 > buf.length) throw new ProtobufError('Truncated fixed64');
        push(fieldNumber, buf.readDoubleLE(offset));
        offset += 8;
        break;
      }
      case WIRE_LENGTH: {
        const len = readVarint(buf, offset);
        offset = len.offset;
        const size = Number(len.value);
        if (size < 0 || offset + size > buf.length) {
          throw new ProtobufError('Truncated length-delimited field');
        }
        push(fieldNumber, buf.subarray(offset, offset + size));
        offset += size;
        break;
      }
      case WIRE_FIXED32: {
        if (offset + 4 > buf.length) throw new ProtobufError('Truncated fixed32');
        push(fieldNumber, buf.readFloatLE(offset));
        offset += 4;
        break;
      }
      default:
        throw new ProtobufError(`Unsupported wire type ${wireType}`);
    }
  }

  return fields;
}

const first = (fields, number) => {
  const list = fields.get(number);
  return list && list.length ? list[0] : undefined;
};

const text = (fields, number) => {
  const raw = first(fields, number);
  return Buffer.isBuffer(raw) ? raw.toString('utf8') : undefined;
};

const number = (fields, number) => {
  const raw = first(fields, number);
  return typeof raw === 'number' ? raw : raw === undefined ? undefined : Number(raw);
};

const message = (fields, number) => {
  const raw = first(fields, number);
  return Buffer.isBuffer(raw) ? parseFields(raw) : undefined;
};

const repeatedMessages = (fields, number) => {
  const list = fields.get(number);
  if (!list) return [];
  return list.filter(Buffer.isBuffer).map((raw) => parseFields(raw));
};

module.exports = {
  ProtobufError,
  parseFields,
  readVarint,
  first,
  text,
  number,
  message,
  repeatedMessages,
};

'use strict';

/**
 * Tiny .env loader (no dependencies). Lines are KEY=VALUE, `#` starts a
 * comment, and optional single/double quotes are stripped.
 */

const fs = require('node:fs');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const source = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (!key) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Real environment variables always win over the file.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

module.exports = { loadEnv };

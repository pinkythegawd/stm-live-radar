'use strict';

/**
 * Vercel serverless adapter.
 *
 * The app's HTTP handler is framework-free, so each function file under /api
 * can reuse it unchanged. The frontend is served statically from /public.
 */

const { handleRequest } = require('./index');

module.exports = handleRequest;

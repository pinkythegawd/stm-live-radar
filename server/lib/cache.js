'use strict';

/**
 * A tiny TTL cache with in-flight request coalescing.
 *
 * Multiple browser tabs polling at the same moment share one upstream call,
 * which keeps us comfortably inside STM's published rate limits.
 */

class TtlCache {
  constructor(ttlMs, minForceIntervalMs = 0) {
    this.ttlMs = ttlMs;
    this.minForceIntervalMs = minForceIntervalMs;
    this.value = null;
    this.fetchedAt = 0;
    this.inFlight = null;
  }

  isFresh() {
    return this.value !== null && Date.now() - this.fetchedAt < this.ttlMs;
  }

  /**
   * @param {() => Promise<any>} loader
   * @param {{force?: boolean}} options
   */
  async get(loader, options = {}) {
    if (!options.force && this.isFresh()) {
      return { ...this.value, cache: 'hit', ageMs: Date.now() - this.fetchedAt };
    }

    if (options.force && this.value && Date.now() - this.fetchedAt < this.minForceIntervalMs) {
      return { ...this.value, cache: 'throttled', ageMs: Date.now() - this.fetchedAt };
    }

    if (this.inFlight) {
      const shared = await this.inFlight;
      return { ...shared, cache: 'shared', ageMs: Date.now() - this.fetchedAt };
    }

    this.inFlight = (async () => {
      const startedAt = Date.now();
      const data = await loader();
      this.value = data;
      this.fetchedAt = Date.now();
      return { ...data, upstreamMs: Date.now() - startedAt };
    })();

    try {
      const result = await this.inFlight;
      return { ...result, cache: 'miss', ageMs: 0 };
    } finally {
      this.inFlight = null;
    }
  }

  peek() {
    return this.value;
  }
}

module.exports = { TtlCache };

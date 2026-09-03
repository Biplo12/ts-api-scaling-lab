import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { pool } from './db/index.js';
import { inflight } from './inflight.js';
import { cacheStats } from './cache.js';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const shedTotal = new Counter({
  name: 'http_requests_shed_total',
  help: 'Requests rejected because the server was over its inflight limit',
  registers: [registry],
});

new Gauge({
  name: 'http_requests_inflight',
  help: 'Requests currently being handled',
  registers: [registry],
  collect() {
    this.set(inflight.current);
  },
});

new Gauge({
  name: 'pg_pool_total_connections',
  help: 'Connections currently in the pool',
  registers: [registry],
  collect() {
    this.set(pool.totalCount);
  },
});

new Gauge({
  name: 'pg_pool_idle_connections',
  help: 'Idle connections in the pool',
  registers: [registry],
  collect() {
    this.set(pool.idleCount);
  },
});

new Gauge({
  name: 'pg_pool_waiting_requests',
  help: 'Requests waiting for a free connection',
  registers: [registry],
  collect() {
    this.set(pool.waitingCount);
  },
});

new Gauge({
  name: 'cache_hits_total',
  help: 'Cache reads served from Redis',
  registers: [registry],
  collect() {
    this.set(cacheStats.hits);
  },
});

new Gauge({
  name: 'cache_misses_total',
  help: 'Cache reads that had to hit Postgres',
  registers: [registry],
  collect() {
    this.set(cacheStats.misses);
  },
});

new Gauge({
  name: 'cache_coalesced_total',
  help: 'Misses that waited on an in-flight build instead of querying',
  registers: [registry],
  collect() {
    this.set(cacheStats.coalesced);
  },
});

new Gauge({
  name: 'cache_errors_total',
  help: 'Redis errors',
  registers: [registry],
  collect() {
    this.set(cacheStats.errors);
  },
});

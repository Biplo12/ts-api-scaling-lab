import { collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';
import { pool } from './db/index.js';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
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

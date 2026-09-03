import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.POOL_MAX) || 10,
  connectionTimeoutMillis: Number(process.env.POOL_TIMEOUT_MS) || 2000,
  statement_timeout: Number(process.env.STATEMENT_TIMEOUT_MS) || 3000,
  query_timeout: Number(process.env.STATEMENT_TIMEOUT_MS) || 3000,
});

export const db = drizzle(pool, { schema });

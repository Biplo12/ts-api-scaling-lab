import { Redis } from 'ioredis';

export const CACHE_ENABLED = process.env.CACHE !== 'off';
export const SINGLEFLIGHT_ENABLED = process.env.SINGLEFLIGHT !== 'off';
export const CACHE_TTL_S = Number(process.env.CACHE_TTL_S) || 30;

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
  enableAutoPipelining: true,
  maxRetriesPerRequest: 2,
  lazyConnect: false,
});

redis.on('error', () => {
  cacheStats.errors++;
});

export const cacheStats = { hits: 0, misses: 0, errors: 0, coalesced: 0 };

const inflight = new Map<string, Promise<string>>();

export async function cached(key: string, build: () => Promise<unknown>): Promise<string> {
  if (!CACHE_ENABLED) {
    return JSON.stringify(await build());
  }

  try {
    const hit = await redis.get(key);
    if (hit !== null) {
      cacheStats.hits++;
      return hit;
    }
  } catch {
    return JSON.stringify(await build());
  }

  cacheStats.misses++;

  if (SINGLEFLIGHT_ENABLED) {
    const running = inflight.get(key);
    if (running) {
      cacheStats.coalesced++;
      return await running;
    }
  }

  const task = (async () => {
    const payload = JSON.stringify(await build());
    try {
      await redis.set(key, payload, 'EX', CACHE_TTL_S);
    } catch {
      /* cache write is best effort */
    }
    return payload;
  })();

  if (SINGLEFLIGHT_ENABLED) {
    inflight.set(key, task);
    void task.finally(() => inflight.delete(key));
  }

  return await task;
}

export async function invalidate(keys: string[]): Promise<void> {
  if (!CACHE_ENABLED || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch {
    /* invalidation is best effort */
  }
}

export const cacheKeys = {
  projectTasks: (projectId: number) => `p:${projectId}:tasks`,
  task: (taskId: number) => `t:${taskId}`,
};

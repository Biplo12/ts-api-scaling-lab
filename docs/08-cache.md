# Stage 8: Redis in front of the reads

A cache, invalidation on write, and singleflight against stampedes.

**Capacity: 2000 RPS to 2600 RPS. Hit rate 37 percent, and that number turned out
to be the interesting part.**

![Stampede](img/stage8-stampede.svg)

## The problem

Stage 7 ended with `writev` as the biggest cost, the kernel copying bytes into
sockets. Nothing in the application makes that cheaper. The only way forward is
to not build the response at all.

## The change

Cached values are stored and returned as raw JSON strings, never parsed:

```ts
const payload = await cached(cacheKeys.projectTasks(projectId), async () => {
  return { project, tasks };
});
return reply.type('application/json').send(payload);
```

A hit skips the queries, the object mapping and the serialization together.
Adding a comment clears both affected keys:

```ts
await invalidate([cacheKeys.task(taskId), cacheKeys.projectTasks(task.projectId)]);
```

## Numbers

Four workers, shedding on:

| Variant         | Offered | Accepted | p95   | p99    | Hit rate |
| --------------- | ------- | -------- | ----- | ------ | -------- |
| no cache        | 2000    | 2117     | 52 ms | 87 ms  | -        |
| cache, ttl 30 s | 2000    | 2130     | 40 ms | 65 ms  | 35.8%    |
| cache, ttl 30 s | 3000    | **2631** | 55 ms | 87 ms  | 38.5%    |
| cache, ttl 30 s | 4000    | 2575     | 65 ms | 104 ms | 38.0%    |

## TTL turned out not to matter

| TTL   | Hit rate | Accepted at 3000 offered |
| ----- | -------- | ------------------------ |
| 30 s  | 37.8%    | 2631                     |
| 120 s | 37.8%    | 2428                     |
| 600 s | 36.9%    | 2318                     |

Twenty times the TTL, one percentage point of difference. The limit is not how
long keys live, it is how often the same key is asked for.

`/tasks/:id` picks from 2 million ids. Even with skewed traffic two requests
rarely want the same task, so almost all of them miss. That endpoint is 40
percent of the traffic and it holds the average down whatever TTL I set.
`/projects/:id/tasks` picks from 20 000 and caches well.

A cache only helps where the same thing gets asked for twice. What to cache is a
question about the access pattern, not about Redis.

## Cache stampede

When a hot key expires, every request arriving before the first one finishes goes
to the database, and all of them compute the same answer.

Singleflight keeps one build per key per process. Everyone else waits on that
promise:

```ts
const running = inflight.get(key);
if (running) return await running;
```

One key, 2 second TTL, 30 second run:

| Offered  | Plain cache  | Singleflight |                 |
| -------- | ------------ | ------------ | --------------- |
| 2000 RPS | 434 queries  | 102          | 4.3x fewer      |
| 6000 RPS | 1370 queries | 118          | **11.6x fewer** |

Three times the traffic gave three times the queries without singleflight and
roughly the same number with it. Load on the database stopped depending on
traffic and started depending on how often keys expire.

Latency at 6000 RPS barely moved, p95 of 21.9 ms against 22.7 ms, but the worst
case fell from 209 ms to 163 ms.

## Notes

My first stampede test showed no difference at all, because traffic was spread
over thousands of keys and a stampede needs a hot one. I wrote a second load
script that hammers a single endpoint and the effect appeared immediately.

Singleflight is per process. Four workers means up to four concurrent builds per
key, not one. Getting to exactly one would need coordination through Redis, which
costs a round trip on every miss.

Singleflight can raise p99 at low rates, because waiters queue behind one build
instead of running their own. At 2000 RPS p99 went from 9.0 to 14.4 ms while the
worst case fell from 193 to 129 ms. It trades a little median for a much shorter
tail.

Returning raw strings means Fastify response schemas do not apply to cached
routes, so I compared cache-off against cache-on responses byte for byte instead.
Golden files: [projects](stage8/golden-projects.json), [task](stage8/golden-task.json)

Redis runs with `--save "" --appendonly no` and an LRU limit. Losing the cache
costs a slow minute, not data.

`pg_stat_statements` needed `shared_preload_libraries` in the Compose command and
a restart. `CREATE EXTENSION` on its own collects nothing, which cost me a
confusing ten minutes.

## Next

The remaining misses are 60 percent of traffic and each one runs three prepared
queries. A pooler would let more workers share fewer connections. Caching
`/tasks/:id` under something other than its own id, per project page for
instance, would move the hit rate.

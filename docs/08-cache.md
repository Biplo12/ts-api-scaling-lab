# Stage 8: Redis in front of the reads

Added a Redis cache, invalidation on write, and singleflight against stampedes.

**Capacity: 2000 RPS to 2600 RPS. Hit ratio 37 percent, and that number is the
interesting part.**

![Stampede](img/stage8-stampede.svg)

## The problem

Stage 7 ended with `writev` as the largest single cost: the kernel copying
response bytes into sockets. No application change makes that cheaper. The only
way forward is to not build the response at all.

## The change

Cached values are stored and returned as **raw JSON strings**, never parsed:

```ts
const payload = await cached(cacheKeys.projectTasks(projectId), async () => {
  return { project, tasks };
});
return reply.type('application/json').send(payload);
```

A hit skips the queries, the object mapping, and the serialization in one go.
Adding a comment invalidates both affected keys:

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

## TTL does not move the hit rate

| TTL   | Hit rate | Accepted at 3000 offered |
| ----- | -------- | ------------------------ |
| 30 s  | 37.8%    | 2631                     |
| 120 s | 37.8%    | 2428                     |
| 600 s | 36.9%    | 2318                     |

Ten times the TTL, one percentage point of difference. The limit is not how long
keys live, it is **how often the same key is asked for**.

`/tasks/:id` picks from 2 million ids. Even with skewed traffic, two requests
rarely want the same task, so almost every one of them is a miss. That endpoint
is 40 percent of the traffic and it drags the average down no matter what TTL I
set. `/projects/:id/tasks` picks from 20 000 and caches well.

A cache only helps where the same thing is requested twice. Deciding what to
cache is a question about the access pattern, not about Redis.

## Cache stampede

When a hot key expires, every request that arrives before the first one finishes
goes to the database. All of them compute the same answer.

Singleflight keeps one in-flight build per key per process. Everyone else waits
on that promise:

```ts
const running = inflight.get(key);
if (running) return await running;
```

One key, 2 second TTL, 30 second run:

| Offered  | Plain cache  | Singleflight |                 |
| -------- | ------------ | ------------ | --------------- |
| 2000 RPS | 434 queries  | 102          | 4.3x fewer      |
| 6000 RPS | 1370 queries | 118          | **11.6x fewer** |

Three times the traffic gave three times the queries without singleflight, and
almost the same number with it. Load on the database stopped depending on
traffic and started depending on how often keys expire.

Latency at 6000 RPS was effectively unchanged, p95 of 21.9 ms against 22.7 ms,
but the worst case dropped from 209 ms to 163 ms.

## Notes

- My first stampede test showed no difference at all, because traffic was spread
  over thousands of keys. A stampede needs a hot key. I wrote a second load
  script that hammers one endpoint, and only then the effect appeared.
- Singleflight is per process. Four workers means up to four concurrent builds
  per key, not one. Getting to exactly one would need coordination through Redis,
  which costs a round trip on every miss.
- Singleflight can raise p99 slightly at low rates, because waiters queue behind
  one build instead of running their own. At 2000 RPS p99 went from 9.0 to
  14.4 ms while the worst case fell from 193 to 129 ms. It trades a little
  median for a much shorter tail.
- Returning raw strings from cache means Fastify response schemas do not apply
  to those routes. I checked cache-off against cache-on responses byte for byte
  instead.
  Golden files: [projects](stage8/golden-projects.json), [task](stage8/golden-task.json)
- Redis runs with `--save "" --appendonly no` and an LRU limit. Losing the whole
  cache costs a slow minute, not data.
- `pg_stat_statements` needed `shared_preload_libraries` in the Compose command
  and a restart. Creating the extension alone collects nothing.

## Next

The remaining misses are 60 percent of traffic and they all hit Postgres with
three prepared queries each. A pooler would let more workers share fewer
connections, and caching `/tasks/:id` by something other than its id, for
example per project page, would move the hit rate.

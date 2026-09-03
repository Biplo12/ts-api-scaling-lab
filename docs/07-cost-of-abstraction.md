# Stage 7: The cost of abstraction

Prepared statements, response schemas, fewer columns. The database was not
touched.

**Capacity: 1200 RPS to 2000 RPS, with p99 at 93 ms instead of 209 ms.**

![CPU per request](img/stage7-cpu.svg)

## The problem

The database was idle at capacity and Node was the limit, so I profiled it with
`node --cpu-prof` at 700 RPS on one worker.

|                                   | Self time |
| --------------------------------- | --------- |
| drizzle-orm                       | 37.0%     |
| native (`writev` 12.2%)           | 18.3%     |
| node internals                    | 13.0%     |
| fastify (JSON serialization 7.9%) | 9.7%      |
| V8                                | 6.8%      |
| pg and friends                    | 10.0%     |
| GC                                | 2.2%      |
| **app code**                      | **1.2%**  |

Eighty-seven percent of the CPU went to layers between my code and the socket.
The single most expensive function in the whole server was `is` from Drizzle at
13.9 percent, an internal type check called while building every query fragment.

## The changes

Drizzle rebuilt the SQL on every request. Now each query is built once at startup
and only the parameters change:

```ts
const tasksByProject = db
  .select({ ... })
  .where(eq(schema.tasks.projectId, sql.placeholder('projectId')))
  .prepare('tasks_by_project');
```

The batched comment count needed `= ANY($1::bigint[])` instead of `inArray`,
because `IN (...)` has a different number of placeholders every time and cannot
be prepared.

Without a response schema Fastify falls back to `JSON.stringify`. With one it
uses `fast-json-stringify`, which knows the shape up front.

The task list selected every column, including a `text` description nobody reads
in a list. It now selects seven.

## Numbers

One worker, measured after each change:

| Step                | Ceiling   | Gain |
| ------------------- | --------- | ---- |
| after stage 6       | 760 RPS   |      |
| prepared statements | ~1080 RPS | +42% |
| response schemas    | ~1160 RPS | +7%  |
| fewer columns       | ~1270 RPS | +9%  |

Four workers with shedding on, the default configuration:

| Offered | Accepted | med   | p95   | p99    | 503    |
| ------- | -------- | ----- | ----- | ------ | ------ |
| 2000    | 2033     | 20 ms | 57 ms | 93 ms  | 3591   |
| 2400    | 2051     | 28 ms | 64 ms | 107 ms | 12 695 |
| 3000    | 2104     | 39 ms | 71 ms | 107 ms | 26 180 |

## CPU per request

The two profiles were taken at different rates, so percentages do not compare.
Samples per request do.

|                    | Before  | After   |          |
| ------------------ | ------- | ------- | -------- |
| drizzle-orm        | 334     | 68      | -80%     |
| native (`writev`)  | 165     | 178     | +8%      |
| node internals     | 117     | 101     | -14%     |
| pg driver          | 90      | 80      | -12%     |
| JSON serialization | 88      | 42      | -52%     |
| V8                 | 61      | 48      | -21%     |
| app code           | 11      | 8       | -24%     |
| **total**          | **903** | **550** | **-39%** |

## Notes

Prepared statements were worth more than the other two together. `is` went from
the most expensive function in the server to outside the top ten.

Response schemas halved serialization and gained 7 percent overall, because
serialization was 10 percent of the work to begin with. The profile predicted
that correctly, which is the argument for profiling before optimizing.

Fewer columns changed the API. The list response went from 6254 to 3722 bytes.
That is a contract change, not a free win, and it is only defensible because a
list does not need a full description.

Every change was checked against a saved response. The first two are byte
identical, the third changed on purpose.
Golden files: [projects](stage7/golden-projects.json), [task](stage7/golden-task.json)

Prepared statements have a warm-up cost. The first run after a restart showed p95
of 455 ms while every connection in the pool parsed the statements. The second
showed 19 ms.

`writev` is now the biggest single cost at 22 percent. That is the kernel copying
response bytes into a socket and no application code will make it cheaper.

Profiles: [before](stage7/profile-700rps.txt), [after](stage7/profile-after.txt),
[per request](stage7/cpu-per-request.txt). The raw `.cpuprofile` files are next
to them and open in Chrome DevTools.

## Next

Going faster means not generating those bytes at all.

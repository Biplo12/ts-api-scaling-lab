# Stage 1: Baseline

Goal: measure the system before touching anything.

## How fast is the setup itself

/health returns a constant and never touches the database. This is the limit of
the whole setup, k6 included.

| Target rate | Got     | p95      | Failed |
| ----------- | ------- | -------- | ------ |
| 2 000       | 2 000   | ~0 ms    | 0%     |
| 10 000      | 10 000  | ~0 ms    | 0%     |
| 15 000      | 14 870  | 19.7 ms  | 0%     |
| 20 000      | 18 132  | 127.8 ms | 2.94%  |

**Ceiling: about 15 000 RPS.** At 2 000 RPS the server used two virtual users. It
did not notice the load at all.

k6 runs on the same machine, so part of this limit is k6 itself.

## One request at a time

Median of 15 runs.

| Endpoint            | Median  | Queries |
| ------------------- | ------- | ------- |
| /health             | 1.7 ms  | 0       |
| /tasks/:id          | 104 ms  | 15      |
| /projects/:id/tasks | 2244 ms | 42      |

## Under load

Traffic split 60 / 30 / 10. Logger off.

At 1 request per second:

| Endpoint            | Median  | p95     |
| ------------------- | ------- | ------- |
| /projects/:id/tasks | 3510 ms | 4980 ms |
| /tasks/:id          | 169 ms  | 733 ms  |

At 2 requests per second it stopped keeping up. It delivered 1.26 RPS and p99 on
the task list hit 25.8 seconds.

**Capacity: about 1 RPS.**

## What I learned

**Fastify is not the problem.**

15 000 RPS on /health, 1 RPS on real traffic. Everything worth fixing is in the
database layer.

**Requests start blocking each other immediately.**

One task list alone takes 2244 ms. At 1 RPS the median is already 3510 ms. One
request per second is enough for them to queue up.

**Nothing fails. It only gets slower.**

Zero errors at 2 RPS while p99 was 25.8 seconds. There are no timeouts and no
limits, so the server queues work forever instead of refusing it. A real client
would have given up long before. Stage 6 is about this.

**The missing index on comments.task_id costs the most.**

The task list runs 20 counts over a 666 MB table, one per task. That is roughly
13 GB of reads for one request. /tasks/:id does one of those counts and is 20
times faster.

**`localhost` cost 206 ms per request.**

Through `localhost` /health took 208 ms. Through `127.0.0.1` it took 1.8 ms. On
Windows the name resolves to IPv6 first and the server listens on IPv4, so every
request waited for that to fail. All tests use the IP now.

**The same query twice differed by 40 percent.**

62 ms and 87 ms for identical SQL. Every number here is a median of several runs.

## What the metrics endpoint costs

I added prom-client and an onResponse hook, then measured /health again.

At 10 000 RPS, where the setup is stable:

| Metrics | RPS    | avg    | p95      |
| ------- | ------ | ------ | -------- |
| off     | 10 000 | 34 us  | ~0       |
| on      | 9 998  | 179 us | 751 us   |
| on      | 9 982  | 310 us | 1.01 ms  |

Throughput holds, but average latency goes up 5 to 9 times.

At 15 000 RPS, where the setup is already at its limit:

| Metrics | RPS    | p95     | Failed |
| ------- | ------ | ------- | ------ |
| off     | 14 870 | 19.7 ms | 0%     |
| on      | 14 599 | 81.1 ms | 0.30%  |
| on      | 13 953 | 176.8 ms | 3.83% |
| on      | 13 485 | 181.4 ms | 2.34% |

Two things here. The hook costs real time, and near the limit it pushes the
system into failures. But the spread between runs is also huge, from 17 ms to
132 ms average, so at 15 000 RPS the setup stops being repeatable. Three runs
back to back also heat the CPU, which may be part of it.

I keep the metrics on. Losing 200 microseconds is worth knowing where the
bottleneck is. But numbers above 10 000 RPS from this machine are not solid.

## Next

Stage 2: indexes. One at a time, measured separately. Starting with
comments.task_id.

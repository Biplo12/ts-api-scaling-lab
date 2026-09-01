# Stage 1: Baseline

Goal: measure the untouched system, first one request at a time, then under load.

## Setup ceiling

/health only, no database. This is the limit of the whole setup, k6 included.

| Target rate | Actual RPS | p95      | Failed | Notes                  |
| ----------- | ---------- | -------- | ------ | ---------------------- |
| 2 000       | 2 000      | ~0 ms    | 0%     | 2 VUs were enough      |
| 10 000      | 10 000     | ~0 ms    | 0%     | avg 34 us              |
| 15 000      | 14 870     | 19.7 ms  | 0%     | k6 starts dropping     |
| 20 000      | 18 132     | 127.8 ms | 2.94%  | overloaded             |

Practical ceiling: **~15 000 RPS**. Comfortable: 10 000 RPS.

k6 runs on the same machine, so part of this is k6 competing for CPU.

## Single requests, no load

Median of 15 runs through 127.0.0.1.

| Endpoint            | Median  | Queries |
| ------------------- | ------- | ------- |
| /health             | 1.7 ms  | 0       |
| /tasks/:id          | 104 ms  | 15      |
| /projects/:id/tasks | 2244 ms | 42      |

## Under load

Traffic split 60/30/10. Logger off.

At 1 request per second:

| Endpoint            | Median  | p95     |
| ------------------- | ------- | ------- |
| /projects/:id/tasks | 3510 ms | 4980 ms |
| /tasks/:id          | 169 ms  | 733 ms  |

At 2 requests per second the system stops keeping up. It delivered 1.26 RPS and
p99 on the task list reached 25.8 seconds.

**Capacity of the real traffic mix: about 1 RPS.**

## What I learned

**1. Fastify is not the bottleneck, not even close.**

15 000 RPS on /health versus 1 RPS on real traffic. The gap is four orders of
magnitude. Everything that matters is in the database layer.

**2. Contention starts at the very first concurrent request.**

A single task list takes 2244 ms alone. At 1 RPS the median is already 3510 ms.
One request per second is enough to make requests wait for each other.

**3. Nothing fails. Everything just gets slower.**

0% errors at 2 RPS while p99 was 25.8 seconds. There are no timeouts and no
limits, so the server queues work forever instead of refusing it. A real client
would have given up long before. This is what stage 6 is about.

**4. The missing index on comments.task_id is the main cost.**

The task list runs 20 counts over a 666 MB table, one per task. That is around
13 GB of reads for one request. /tasks/:id does one such count and is 20 times
faster.

**5. `localhost` cost 206 ms per request.**

Through `localhost` /health took 208 ms, through `127.0.0.1` it took 1.8 ms. On
Windows `localhost` resolves to IPv6 first and the server listens on IPv4, so
every request waited for that to fail. All tests use the IP address now.

**6. Repeated runs of the same query differed by 40 percent.**

62 ms and 87 ms for identical SQL. Every number here is a median of several runs.

## Next

Stage 2: indexes. Starting with comments.task_id, then the foreign keys on
tasks. Measure after each one, separately.

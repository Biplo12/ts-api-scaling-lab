# Stage 1: Baseline

Measured the system before touching anything.

**Capacity: 1 RPS.** p95 on the task list: 4980 ms.

## How fast is the setup itself

`/health` returns a constant and never touches the database. This is the limit of
everything, k6 included.

| Target | Got    | p95      | Failed |
| ------ | ------ | -------- | ------ |
| 2 000  | 2 000  | ~0 ms    | 0%     |
| 10 000 | 10 000 | ~0 ms    | 0%     |
| 15 000 | 14 870 | 19.7 ms  | 0%     |
| 20 000 | 18 132 | 127.8 ms | 2.94%  |

About 15 000 RPS. At 2 000 the server used two virtual users and did not notice.

## The endpoints

One request at a time, median of 15 runs.

| Endpoint            | Median  | Queries |
| ------------------- | ------- | ------- |
| /health             | 1.7 ms  | 0       |
| /tasks/:id          | 104 ms  | 15      |
| /projects/:id/tasks | 2244 ms | 42      |

Under load at 1 RPS the task list median was already 3510 ms. At 2 RPS the server
stopped keeping up and p99 reached 25.8 seconds.

## Notes

Fastify is not the problem. 15 000 against 1 is four orders of magnitude and all
of it sits in the database layer.

Requests block each other immediately. A single task list takes 2244 ms alone; at
one request per second the median is 3510 ms. One per second is enough to make
them queue.

Nothing fails, things only get slower. Zero errors while p99 was 25.8 seconds,
because there are no timeouts and no limits anywhere. A real client would have
hung up long before. Stage 6 deals with this.

`localhost` cost 206 ms per request. Through `localhost` /health took 208 ms,
through `127.0.0.1` it took 1.8 ms. On Windows the name resolves to IPv6 first
and the server listens on IPv4, so every request waited for that to fail. If I
had run the whole project through `localhost`, every number in it would be
garbage.

The same query twice gave 62 ms and 87 ms. A 40 percent spread, so single runs
are worthless here. Everything below is a median of several.

The metrics endpoint costs around 200 microseconds per request at 10 000 RPS.
Worth it. Above 10 000 this machine stops being repeatable anyway, which is a
more useful thing to know than the exact overhead.

## Next

The task list runs 20 counts over a 666 MB table. Index that.

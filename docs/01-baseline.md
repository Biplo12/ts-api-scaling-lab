# Stage 1: Baseline

Measured the untouched system.

**Capacity: 1 RPS.** p95 on the task list: 4980 ms.

## Where the setup tops out

/health returns a constant and never touches the database.

| Target | Got    | p95      | Failed |
| ------ | ------ | -------- | ------ |
| 2 000  | 2 000  | ~0 ms    | 0%     |
| 10 000 | 10 000 | ~0 ms    | 0%     |
| 15 000 | 14 870 | 19.7 ms  | 0%     |
| 20 000 | 18 132 | 127.8 ms | 2.94%  |

Ceiling is about 15 000 RPS. At 2 000 the server used two virtual users.

## The endpoints

Median of 15 runs, one request at a time.

| Endpoint            | Median  | Queries |
| ------------------- | ------- | ------- |
| /health             | 1.7 ms  | 0       |
| /tasks/:id          | 104 ms  | 15      |
| /projects/:id/tasks | 2244 ms | 42      |

Under load at 1 RPS the task list median was already 3510 ms. At 2 RPS the
server stopped keeping up and p99 hit 25.8 seconds.

## Notes

- Fastify is not the bottleneck. 15 000 RPS versus 1 RPS is four orders of
  magnitude, all of it in the database layer.
- Requests block each other from the very first one. A lone task list takes
  2244 ms; at 1 RPS the median is 3510 ms.
- Nothing fails, it only gets slower. Zero errors at p99 of 25.8 seconds,
  because there are no timeouts and no limits.
- `localhost` cost 206 ms per request. On Windows it resolves to IPv6 first and
  the server listens on IPv4. All tests use `127.0.0.1` now.
- The same query ran twice differed by 40 percent, 62 ms against 87 ms. Every
  number here is a median of several runs.
- The metrics endpoint costs about 200 us per request at 10 000 RPS. Worth it.
  Above 10 000 RPS this machine stops being repeatable anyway.

## Next

The task list runs 20 counts over a 666 MB table. Index that.

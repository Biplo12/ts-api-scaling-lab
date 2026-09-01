# Stage 1: Baseline

Goal: measure the untouched system. No load yet, one request at a time.

## Results

Median of 15 runs, through 127.0.0.1.

| Endpoint            | Median  | Queries |
| ------------------- | ------- | ------- |
| /health             | 1.7 ms  | 0       |
| /tasks/:id          | 104 ms  | 15      |
| /projects/:id/tasks | 2244 ms | 42      |

Logger was still on.

## What I learned

**1. `localhost` cost 206 ms per request.**

Through `localhost` /health took 208 ms. Through `127.0.0.1` it took 1.8 ms. On
Windows `localhost` resolves to IPv6 first and the server listens on IPv4, so
every request waited for that to fail. All tests use the IP address now.

**2. The task list runs 21 table scans.**

One over 2 million tasks, twenty over 5 million comments. That is about 13 GB of
reads for a single request.

**3. The missing index on comments.task_id is the main cost.**

/tasks/:id does one scan of comments and takes 104 ms. /projects/:id/tasks does
twenty and takes 2244 ms. The difference is almost entirely that one index.

**4. Two runs of the same query differed by 40 percent.**

62 ms and 87 ms for the same SQL. Single numbers mean nothing here. Everything
gets reported as a median of several runs.

**5. Fastify itself is not the problem.**

1.7 ms for /health with the logger on. The ceiling is far above what the
database currently allows.

## Next

1. Turn off the logger.
2. Write the k6 script with the same skew as the seeder.
3. Measure under load: RPS and p99.

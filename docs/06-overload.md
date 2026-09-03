# Stage 6: Behaviour under overload

Added query timeouts, a pool wait timeout, and a limit on requests in flight.

**Capacity did not change. What changed is what happens above it.**

![p99 under overload](img/stage6-overload.svg)

## The problem

Every stage so far ended the same way: past capacity the server returned zero
errors and simply made everyone wait longer. At 2000 offered RPS p99 was 1.23
seconds and k6 abandoned 27 855 requests because they never came back in time.

A real client gives up long before that. The server was still computing answers
nobody was waiting for.

## The change

Three limits, all configurable through `.env`:

```ts
new Pool({
  connectionTimeoutMillis: 2000,
  statement_timeout: 3000,
  query_timeout: 3000,
});
```

```ts
if (shedding && inflight.current >= MAX_INFLIGHT) {
  reply.status(503).header('retry-after', '1').send({ error: 'Server overloaded' });
  return;
}
```

`/health` and `/metrics` skip the check, so monitoring still works while the
server is refusing traffic.

## Numbers

p99 of accepted requests, 4 workers:

| Offered | No limits | Shedding, limit 25 |
| ------- | --------- | ------------------ |
| 400     | 54 ms     | 42 ms              |
| 800     | 72 ms     | 123 ms             |
| 1200    | 246 ms    | 153 ms             |
| 1600    | 971 ms    | -                  |
| 2000    | 1230 ms   | **209 ms**         |

Requests refused, and requests k6 gave up on:

| Offered | No limits: given up | Shedding: 503 returned |
| ------- | ------------------- | ---------------------- |
| 400     | 0                   | 0                      |
| 800     | 102                 | 26                     |
| 1200    | 496                 | 3569                   |
| 2000    | 27 855              | 29 644                 |

Throughput of successful requests is unchanged, around 1100 per second either
way. Shedding does not make the server faster. It makes the server honest.

## The limit is a latency dial

The inflight limit sets maximum latency directly. Same offered load of 2000 RPS,
only the limit changed:

| Limit per worker | In flight total | med    | p99    |
| ---------------- | --------------- | ------ | ------ |
| 15               | 60              | 53 ms  | 154 ms |
| 25               | 100             | 88 ms  | 209 ms |
| 50               | 200             | 198 ms | 402 ms |
| 100              | 400             | 319 ms | 565 ms |

This is Little's law, `L = lambda * W`. At about 1070 accepted requests per
second, 60 in flight predicts 56 ms of latency and the measured median was
53 ms. For 100 in flight it predicts 93 ms and measured 88 ms. For 200 it
predicts 205 ms and measured 198 ms.

I did not expect the arithmetic to line up this closely.

## Notes

- Capacity is unchanged. This stage does not add throughput, it caps latency.
  Both are worth having and they are different things.
- Shedding costs something at medium load. At 800 RPS p99 was 123 ms with the
  limit against 72 ms without. Limit 25 caps concurrency below what the machine
  could use at that rate. It is the price of the guarantee above capacity.
- Picking the limit is a decision about the latency you promise, not a tuning
  knob to maximize. Choose the p99 you want, divide by your throughput, and that
  is your limit.
- 503 with `retry-after` is a real answer. The client learns immediately and can
  retry or degrade. Waiting 1.2 seconds for an answer teaches it nothing.
- Timeouts alone changed almost nothing: 1025 accepted RPS against 1145 without
  them, p95 still 1.46 s. They stop a single stuck query from holding a
  connection forever, but they do not shorten a queue.
- `/health` had to be exempt. A monitoring endpoint that returns 503 during
  overload would take the server out of the load balancer at the worst moment.

## Next

The server now behaves under overload but capacity is still around 1285 RPS, and
the database is idle at that point. Redis in front of the read endpoints is the
next place to look.

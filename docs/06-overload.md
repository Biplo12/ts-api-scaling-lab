# Stage 6: Under overload

Query timeouts, a pool wait timeout, and a cap on requests in flight.

**Capacity did not change. What happens above it did.**

![p99 under overload](img/stage6-overload.svg)

## The problem

Every stage so far ended the same way. Past capacity the server returned zero
errors and made everyone wait longer. At 2000 offered RPS p99 was 1.23 seconds
and k6 abandoned 27 855 requests that never came back in time.

A real client gives up long before that, so the server was computing answers
nobody was waiting for.

## The change

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

`/health` and `/metrics` skip the check. A monitoring endpoint that returns 503
during overload would take the server out of the load balancer at the worst
possible moment.

## Numbers

p99 of accepted requests, four workers:

| Offered | No limits | Shedding, limit 25 |
| ------- | --------- | ------------------ |
| 400     | 54 ms     | 42 ms              |
| 800     | 72 ms     | 123 ms             |
| 1200    | 246 ms    | 153 ms             |
| 1600    | 971 ms    | -                  |
| 2000    | 1230 ms   | **209 ms**         |

What the client sees:

| Offered | No limits: gave up waiting | Shedding: told to retry |
| ------- | -------------------------- | ----------------------- |
| 400     | 0                          | 0                       |
| 800     | 102                        | 26                      |
| 1200    | 496                        | 3569                    |
| 2000    | 27 855                     | 29 644                  |

Throughput of successful requests is the same either way, around 1100 per second.
Shedding does not make the server faster. It makes it honest.

## The limit is a latency dial

Same offered load of 2000 RPS, only the limit changed:

| Limit per worker | In flight total | med    | p99    |
| ---------------- | --------------- | ------ | ------ |
| 15               | 60              | 53 ms  | 154 ms |
| 25               | 100             | 88 ms  | 209 ms |
| 50               | 200             | 198 ms | 402 ms |
| 100              | 400             | 319 ms | 565 ms |

This is Little's law, `L = lambda * W`. At about 1070 accepted per second, 60 in
flight predicts 56 ms and I measured 53. For 100 it predicts 93 and I measured 88. For 200 it predicts 205 and I measured 198.

I did not expect the arithmetic to land that close.

## Notes

Capacity is unchanged. This stage caps latency, it does not add throughput. Both
are worth having and they are different things.

Shedding costs something at medium load. At 800 RPS p99 was 123 ms with the limit
and 72 ms without, because limit 25 caps concurrency below what the machine could
use at that rate. That is the price of the guarantee higher up.

Picking the limit is a decision about the latency you promise, not a knob to
maximize. Choose the p99 you want, divide by your throughput, and there is the
limit.

Timeouts alone changed almost nothing: 1025 accepted RPS against 1145 without
them, p95 still 1.46 s. They stop one stuck query from holding a connection
forever. They do not shorten a queue.

## Next

The database is idle at capacity and Node is the limit. Time to find out what
Node is actually doing.

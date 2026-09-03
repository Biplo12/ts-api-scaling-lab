# ts-api-scaling-lab

[![CI](https://github.com/Biplo12/ts-api-scaling-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/Biplo12/ts-api-scaling-lab/actions/workflows/ci.yml)

I wrote a normal REST API on Postgres, the way you write one when nobody is
watching the clock. Then I made it faster, one change at a time, measuring after
each one.

It went from 1 request per second to 2600 on the same desktop. Every step is
written down, including the ones that made things worse.

![Capacity by stage](docs/img/capacity.svg)

## Where it stands

| Stage | Change                             | Capacity | p95 there | p99 at 2000 offered |
| ----- | ---------------------------------- | -------- | --------- | ------------------- |
| 1     | nothing, baseline                  | 1 RPS    | 4980 ms   |                     |
| 2     | one index on comments.task_id      | 30 RPS   | 235 ms    |                     |
| 3     | the right composite index on tasks | 120 RPS  | 197 ms    |                     |
| 4     | joins instead of N+1               | 400 RPS  | 8 ms      |                     |
| 5     | Node on 4 processes instead of 1   | 1200 RPS | 46 ms     | 1230 ms             |
| 6     | timeouts and load shedding         | 1200 RPS | 46 ms     | 209 ms              |
| 7     | prepared statements, schemas       | 2000 RPS | 57 ms     | 93 ms               |
| 8     | Redis cache with singleflight      | 2600 RPS | 55 ms     | 65 ms               |

Nothing was added to the hardware. Above capacity the server returns 503 instead
of queueing, which is what stage 6 is about.

The same setup does 15 000 RPS on an endpoint that returns a constant, so there
is still headroom. Most of the remaining cost is talking to a database from
JavaScript.

## Contents

- [Stage notes](#stage-notes), one file per step with the numbers
- [Why the first version was slow](#why-the-first-version-was-slow)
- [The database](#the-database)
- [Endpoints](#endpoints)
- [Machine and stack](#machine-and-stack)
- [Run it](#run-it)
- [Measure it](#measure-it)

## Stage notes

| File                                                        | What is in it                          |
| ----------------------------------------------------------- | -------------------------------------- |
| [00-starting-point.md](docs/00-starting-point.md)           | Design decisions and what I left out   |
| [01-baseline.md](docs/01-baseline.md)                       | The untouched system, 1 RPS            |
| [02-indexes.md](docs/02-indexes.md)                         | One index, 30x capacity                |
| [03-index-choice.md](docs/03-index-choice.md)               | Four indexes for one query, 300x apart |
| [04-n-plus-one.md](docs/04-n-plus-one.md)                   | 42 queries down to 3                   |
| [05-cluster.md](docs/05-cluster.md)                         | Four processes beat six                |
| [06-overload.md](docs/06-overload.md)                       | Saying no instead of queueing          |
| [07-cost-of-abstraction.md](docs/07-cost-of-abstraction.md) | Where the CPU actually goes            |
| [08-cache.md](docs/08-cache.md)                             | Cache, and why TTL did not matter      |

## Why the first version was slow

Nothing was sabotaged for the charts. This is what code looks like when nobody
thinks about performance:

- Queries written the way ORM docs show them, one call per related row.
- No indexes on foreign keys. Postgres does not add them for you.
- Default Postgres config. 128 MB of cache for a 1 GB database.

Every version is in git, so each number has something to compare against.

## The database

A small SaaS for tracking work. Organizations own users and projects, projects
hold tasks, tasks hold comments.

![Schema](docs/img/schema.svg)

1003 MB on disk, 7.3 million rows. The seeder uses a fixed random seed, so two
runs give the same database.

The data is uneven on purpose. Real systems have a few big customers and a long
tail of small ones. Flat random data would have made the cache measurements in
stage 8 meaningless.

| Tasks per organization |         |
| ---------------------- | ------- |
| Largest                | 209 879 |
| Median                 | 1 088   |
| Smallest               | 279     |

## Endpoints

| Method | Path                | Queries | Notes                      |
| ------ | ------------------- | ------- | -------------------------- |
| GET    | /health             | 0       | measures the setup ceiling |
| GET    | /tasks/:id          | 2       | was 15 before stage 4      |
| GET    | /projects/:id/tasks | 3       | was 42 before stage 4      |
| POST   | /tasks/:id/comments | 4       | invalidates two cache keys |
| GET    | /metrics            | 0       | Prometheus format          |

`/health` and `/metrics` never get shed, so monitoring keeps working while the
server is refusing traffic.

Load test traffic is split 60 / 30 / 10 between the task list, task details, and
writes.

## Machine and stack

A desktop: Intel Core, 6 cores and 12 threads, 2.6 GHz base and 4.4 GHz boost,
32 GB RAM, NVMe.

Node 24, TypeScript 6, Fastify 5, Postgres 18, Drizzle 0.45, pg 8, Redis 8,
ioredis, prom-client, k6.

Node runs on Windows, Postgres and Redis in Docker, k6 on the same machine. The
load generator competes for CPU with the server, so these numbers show
differences between steps rather than what the hardware could do in a clean
setup. Stage 1 measures how much that costs.

## Run it

```bash
docker compose up -d
```

Starts Postgres and Redis.

```bash
yarn install
```

```bash
cp .env.example .env
```

```bash
yarn db:migrate
```

Loading the data takes about five minutes:

```bash
yarn db:seed
```

```bash
yarn dev
```

## Measure it

Build first, then run with logging off:

```bash
yarn build
```

```bash
yarn start:bench
```

In a second terminal, find the ceiling of the setup:

```bash
yarn bench:ceiling
```

Then real traffic. Start low and work up. The machine needs a moment to settle
between runs, and skipping that gave me one badly wrong result in stage 3:

```bash
k6 run -e RATE=100 -e DURATION=30s bench/load.js
```

Use `127.0.0.1`, not `localhost`. On Windows the name costs 206 ms per request,
which stage 1 explains.

Everything worth toggling lives in `.env`: `WORKERS`, `MAX_INFLIGHT`, `SHEDDING`,
`CACHE`, `SINGLEFLIGHT`, `CACHE_TTL_S`. Each one can be switched off to reproduce
the measurement without it.

### While a test runs

```bash
curl -s http://127.0.0.1:3000/metrics | grep -E "eventloop_lag_mean|pg_pool|cache_"
```

PowerShell has no `grep`, and `curl` there is an alias for something else:

```bash
curl.exe -s http://127.0.0.1:3000/metrics | Select-String "eventloop_lag_mean|pg_pool|cache_"
```

Rising event loop lag means Node is CPU bound. `pg_pool_waiting_requests` above
zero means requests are queuing for a database connection. If both are calm and
latency is high, the database is the slow part.

## License

MIT, see [LICENSE](LICENSE).

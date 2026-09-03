# ts-api-scaling-lab

A performance lab, not a product.

I took a normal REST API on Postgres, wrote it the plain way, and now I make it
faster one step at a time. After every step I measure and write down what that
step gave. It is a learning project, not production code, and the interesting
part is not the final number but which change gave what.

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

2600x capacity on unchanged hardware, with p99 under 100 ms and an honest 503
above capacity. The first version needed 5 seconds to answer a single request.
The setup itself tops out near 15 000 RPS on an endpoint that returns a
constant, so the remaining gap is still large.

## Contents

- [Stage notes](#stage-notes) — one file per step, with the numbers
- [Why the first version was slow](#why-the-first-version-was-slow)
- [The database](#the-database)
- [Endpoints](#endpoints)
- [Machine and stack](#machine-and-stack)
- [Run it](#run-it)
- [Measure it](#measure-it)

## Stage notes

Each file has the same shape: what I did, the numbers, what I learned.

| File                                                        | What is in it                               |
| ----------------------------------------------------------- | ------------------------------------------- |
| [00-starting-point.md](docs/00-starting-point.md)           | Design decisions and what I left out        |
| [01-baseline.md](docs/01-baseline.md)                       | The untouched system, 1 RPS                 |
| [02-indexes.md](docs/02-indexes.md)                         | One index, 30x capacity                     |
| [03-index-choice.md](docs/03-index-choice.md)               | Four indexes for one query, 300x apart      |
| [04-n-plus-one.md](docs/04-n-plus-one.md)                   | 42 queries down to 3                        |
| [05-cluster.md](docs/05-cluster.md)                         | Four processes beat six, and why            |
| [06-overload.md](docs/06-overload.md)                       | Refusing work instead of queueing it        |
| [07-cost-of-abstraction.md](docs/07-cost-of-abstraction.md) | Where CPU actually goes, and 39% less of it |
| [08-cache.md](docs/08-cache.md)                             | Cache, and why TTL did not matter           |

## Why the first version was slow

Not sabotaged to make the charts look good. It is what code looks like when
nobody thinks about performance.

- Queries written the way ORM docs show them, one call per related row.
- No indexes on foreign keys. Postgres does not create them by itself.
- Default Postgres config: 128 MB of shared_buffers for a 1 GB database.

Every version is in git, so each number has something to compare against.

## The database

A small SaaS for tracking work. Organizations own users and projects, projects
hold tasks, tasks hold comments.

![Schema](docs/img/schema.svg)

Total 1003 MB, 7.3 million rows. The seeder uses a fixed random seed, so two
runs give the same database.

Data is skewed on purpose. Real systems have a few big customers and a long tail
of small ones, and flat random data would make cache hit rates meaningless
later.

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
| POST   | /tasks/:id/comments | 4       |                            |
| GET    | /metrics            | 0       | Prometheus format          |

Above capacity the server returns 503 with `retry-after` instead of queueing.
`/health` and `/metrics` are exempt from that check.

Load test traffic is split 60 / 30 / 10 between the task list, task details, and
writes.

## Machine and stack

Intel Core, 6 cores and 12 threads, 2.6 GHz with boost to 4.4 GHz. 32 GB RAM,
NVMe disk, Windows 11.

Node 24, TypeScript 6, Fastify 5, Postgres 18, Drizzle 0.45, pg 8, Redis 8,
ioredis, prom-client, k6.

Node runs on Windows, Postgres in Docker, k6 on the same machine. The load
generator competes for CPU with the server, so these numbers show differences
between steps, not what the hardware could do in a clean setup. That cost is
measured in the stage 1 notes.

## Run it

```bash
docker compose up -d
```

That starts Postgres and Redis.

```bash
yarn install
```

```bash
cp .env.example .env
```

```bash
yarn db:migrate
```

Load the data. Takes about 5 minutes:

```bash
yarn db:seed
```

```bash
yarn dev
```

## Measure it

Build, then run with logging off:

```bash
yarn build
```

```bash
yarn start:bench
```

In a second terminal, first the ceiling of the setup:

```bash
yarn bench:ceiling
```

Then real traffic. Start low and work up, the machine needs to settle between
runs:

```bash
k6 run -e RATE=100 -e DURATION=30s bench/load.js
```

`.env` holds the knobs worth playing with: `WORKERS` (4 is best here, 6 is worse,
stage 5 explains why), `MAX_INFLIGHT` (the latency dial from stage 6), `CACHE`,
`SINGLEFLIGHT` and `CACHE_TTL_S` (stage 8). Every one of them can be switched off
to reproduce the measurement without it.

Use `127.0.0.1`, never `localhost`. On Windows the name costs 206 ms per
request, which is explained in the stage 1 notes.

### While a test runs

```bash
curl -s http://127.0.0.1:3000/metrics | grep -E "eventloop_lag_mean|pg_pool"
```

On PowerShell, where `curl` is an alias and `grep` does not exist:

```bash
curl.exe -s http://127.0.0.1:3000/metrics | Select-String "eventloop_lag_mean|pg_pool"
```

Two numbers say where the bottleneck is. Rising event loop lag means the Node
process is CPU bound. `pg_pool_waiting_requests` above zero means requests are
queuing for a database connection. If both are calm and latency is high, the
database itself is slow.

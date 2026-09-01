# ts-api-scaling-lab

A performance lab, not a product.

I took a normal REST API on Postgres, wrote it the plain way, and now I make it
faster one step at a time. After every step I measure and write down what that
step gave.

The interesting part is not the final number. It is which change gave what.

![One index on comments.task_id](docs/img/stage2-latency.svg)

## Where it stands

| Stage | Change                        | Capacity | p95 on task list |
| ----- | ----------------------------- | -------- | ---------------- |
| 1     | nothing, baseline             | 1 RPS    | 4980 ms          |
| 2     | one index on comments.task_id | 30 RPS   | 235 ms           |

The same setup does **15 000 RPS** on an endpoint that returns a constant. So the
server is not the problem. The gap between 15 000 and 1 is the whole project.

## Why the first version is this slow

The slow version is not sabotaged to make the charts look good. It is what code
looks like when nobody thinks about performance:

- **Queries written the way ORM docs show them.** One call per related row. That
  is where the N+1 comes from: listing 20 tasks runs 42 queries.
- **No indexes on foreign keys.** Postgres does not create them by itself, and
  nobody added them.
- **Default Postgres config.** 128 MB of shared_buffers for a 1 GB database.

I kept this version in git so every later number has something to compare
against.

## Machine

Intel Core, 6 cores and 12 threads, 2.6 GHz base with boost to 4.4 GHz. 32 GB
RAM, NVMe disk, Windows 11.

Node runs on Windows. Postgres runs in Docker. k6 runs on the same machine, so it
competes for CPU with the server. I measured that cost and wrote it down.

## Stack

Node 24, TypeScript 6, Fastify 5, Postgres 18, Drizzle 0.45, pg 8, prom-client,
k6.

## Database

A small SaaS for tracking work. Organizations own users and projects, projects
hold tasks, tasks hold comments.

![Schema](docs/img/schema.svg)

Total size on disk: 1003 MB. Postgres has 128 MB of shared_buffers, so most of
the data does not fit in its cache.

### The data is uneven on purpose

Real systems have a few big customers and a long tail of small ones. Flat random
data would make cache hit rates meaningless later.

|                       | Tasks   |
| --------------------- | ------- |
| Largest organization  | 209 879 |
| Median organization   | 1 088   |
| Smallest organization | 279     |

The seeder uses a fixed random seed, so two runs give the same database.

## Endpoints

| Method | Path                | Queries | Notes                       |
| ------ | ------------------- | ------- | --------------------------- |
| GET    | /health             | 0       | measures the setup ceiling  |
| GET    | /tasks/:id          | 15      | has N+1 on purpose          |
| GET    | /projects/:id/tasks | 42      | has N+1 on purpose          |
| POST   | /tasks/:id/comments | 4       |                             |
| GET    | /metrics            | 0       | Prometheus format           |

Load test traffic is split 60 / 30 / 10 between the task list, task details, and
writes.

## Run it

Start Postgres:

```bash
docker compose up -d
```

Install and set up:

```bash
yarn install
```

```bash
cp .env.example .env
```

```bash
yarn db:migrate
```

Load the data. Takes about 5 minutes and writes 7.3 million rows:

```bash
yarn db:seed
```

Run the server:

```bash
yarn dev
```

## Measure it

Build first, then run the server with logging off:

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

Then the real traffic:

```bash
k6 run -e RATE=1 -e DURATION=60s bench/load.js
```

Use `127.0.0.1`, never `localhost`. On Windows the name costs 206 ms per request.
That one is explained in the stage 1 notes.

### While a test runs

```bash
curl -s http://127.0.0.1:3000/metrics | grep -E "eventloop_lag_mean|pg_pool"
```

On PowerShell, where `curl` is an alias and `grep` does not exist:

```bash
curl.exe -s http://127.0.0.1:3000/metrics | Select-String "eventloop_lag_mean|pg_pool"
```

Two numbers tell you where the bottleneck is:

- **Event loop lag rising** means the Node process is CPU bound.
- **pg_pool_waiting_requests above zero** means requests are queuing for a
  database connection.

If lag is flat and nothing is waiting, the database itself is slow.

## Docs

| File                                              | What is in it                            |
| ------------------------------------------------- | ---------------------------------------- |
| [00-starting-point.md](docs/00-starting-point.md) | Design decisions and what I left out     |
| [01-baseline.md](docs/01-baseline.md)             | First measurements and what they mean    |
| [02-indexes.md](docs/02-indexes.md)               | One index, 30x capacity                  |

Each stage gets its own file: goal, results table, what I learned, next step.

## What comes next

1. Fixing the N+1 queries. The task list still runs 42 of them.
2. The remaining foreign key indexes.
3. Running Node on all cores instead of one.

## What this is not

- Not production code. No auth, no rate limits, no tests yet.
- The N+1 queries are deliberate. They are what stage 3 fixes.
- Numbers come from one desktop machine with the load generator on it. They show
  differences between steps, not what this hardware could do in a clean setup.
- I have not run any of this in production. It is a learning project and the
  numbers are mine to defend, not to advertise.

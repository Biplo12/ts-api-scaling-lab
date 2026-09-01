# Starting point

State before any optimization. Facts only, no measurements.

## Machine

|      |                                      |
| ---- | ------------------------------------ |
| CPU  | Intel i5-11400F, 6 cores, 12 threads |
| RAM  | 32 GB                                |
| Disk | NVMe                                 |
| OS   | Windows 11                           |

Node runs on Windows. Postgres runs in Docker. The load generator runs on the
same machine, so it competes for CPU with the server.

## Stack

Node 24, TypeScript 6, Fastify 5, Postgres 18, Drizzle 0.45, pg 8.

## Schema

Six tables: organizations, users, projects, project_members, tasks, comments.

Every table has org_id, because every query filters by organization.

IDs are bigint identity, not UUID. Sequential numbers keep the index small.

## Data

| Table           | Rows      |
| --------------- | --------- |
| organizations   | 1 000     |
| users           | 50 000    |
| projects        | 20 000    |
| project_members | 200 000   |
| tasks           | 2 000 000 |
| comments        | 5 000 000 |

Size on disk: 1003 MB. Comments 666 MB, tasks 299 MB.

Seeding takes 332 seconds with COPY. Random generator uses seed 42, so two runs
produce the same database.

## Data is skewed

A few organizations are large. Most are small.

|          | Tasks   |
| -------- | ------- |
| Largest  | 209 879 |
| Median   | 1 088   |
| Smallest | 279     |

No organization is empty.

## Endpoints

| Method | Path                | Queries |
| ------ | ------------------- | ------- |
| GET    | /health             | 0       |
| GET    | /tasks/:id          | 15      |
| GET    | /projects/:id/tasks | 42      |
| POST   | /tasks/:id/comments | 4       |

/health returns a constant. It measures the ceiling of the setup.

Both read endpoints have N+1 on purpose.

## Postgres settings

Defaults.

|                |        |
| -------------- | ------ |
| shared_buffers | 128 MB |
| work_mem       | 4 MB   |

## Missing on purpose

- No indexes except primary keys and unique constraints.
- Foreign keys have no indexes. Postgres does not add them.
- No connection pooler.
- No cache.
- No metrics.
- Queries written the plain way, N+1 included.

## Stage notes

| Stage | Notes                            |
| ----- | -------------------------------- |
| 1     | [01-baseline.md](01-baseline.md) |

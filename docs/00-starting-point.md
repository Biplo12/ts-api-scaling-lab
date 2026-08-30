# Starting point

State before any optimization.

## Machine

|      |                                      |
| ---- | ------------------------------------ |
| CPU  | Intel i5-11400F, 6 cores, 12 threads |
| RAM  | 32 GB                                |
| Disk | NVMe                                 |
| OS   | Windows 11                           |

Node runs on Windows. Postgres runs in Docker.

The load generator runs on the same machine as the server. They share CPU, so
there is a ceiling that is not the server's ceiling. I measure it separately.

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

Seeding takes 332 seconds. Data goes in with COPY.

The random generator uses seed 42. Two runs give the same database.

## Data is skewed

A few organizations are large. Most are small.

|          | Tasks   |
| -------- | ------- |
| Largest  | 209 879 |
| Median   | 1 088   |
| Smallest | 279     |

No organization is empty.

## Postgres settings

Defaults.

|                |        |
| -------------- | ------ |
| shared_buffers | 128 MB |
| work_mem       | 4 MB   |

Database is 1003 MB. Most of it does not fit in 128 MB.

## First query

20 tasks from one project, with the assigned user.

```sql
SELECT t.id, t.title, t.status, u.name
FROM tasks t
LEFT JOIN users u ON u.id = t.assignee_id
WHERE t.project_id = 4200
ORDER BY t.created_at DESC
LIMIT 20
```

Time: 62 ms.

- Sequential scan on tasks. No index on project_id.
- 2 million rows scanned to find 93.
- 158 MB read from disk.
- Postgres used two parallel workers.

One core does about 16 of these per second.

Second run of the same query: 87 ms. That is 40 percent apart. Single runs mean
nothing here. Every number has to be a median of several.

Full plan: [baseline/tasks-by-project.txt](baseline/tasks-by-project.txt)

## Not done yet, on purpose

- No indexes except primary keys and unique constraints.
- Foreign keys have no indexes. Postgres does not add them.
- No connection pooler.
- No cache.
- No metrics.
- Queries written the plain way, N+1 included.

## Next

1. Endpoints in Fastify.
2. k6 script with the same skewed traffic.
3. Measure.

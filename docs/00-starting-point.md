# Starting point

What I decided before writing any code.

## Schema

| Decision                    | Why                                   |
| --------------------------- | ------------------------------------- |
| `org_id` on every table     | every query filters by organization   |
| `bigint identity`, not UUID | numbers in order keep the index small |
| `timestamptz` everywhere    | plain `timestamp` loses the time zone |
| Postgres enums              | 4 bytes instead of a string           |

Enums are easy to add values to. They are hard to remove values from. So I fixed
the lists before loading 7.3 million rows.

## Postgres settings

All defaults. `shared_buffers` is 128 MB and `work_mem` is 4 MB. The database is
1003 MB.

## Left broken on purpose

No indexes except primary keys and unique constraints. Foreign keys with no
index. No connection pooler. No cache. No metrics. Query loops instead of joins.

## Stages

|     |                                                  | Capacity |
| --- | ------------------------------------------------ | -------- |
| 1   | [Baseline](01-baseline.md)                       | 1 RPS    |
| 2   | [First index](02-indexes.md)                     | 30 RPS   |
| 3   | [Choosing the index](03-index-choice.md)         | 120 RPS  |
| 4   | [Removing N+1](04-n-plus-one.md)                 | 400 RPS  |
| 5   | [All cores](05-cluster.md)                       | 1200 RPS |
| 6   | [Under overload](06-overload.md)                 | 1200 RPS |
| 7   | [Cost of abstraction](07-cost-of-abstraction.md) | 2000 RPS |
| 8   | [Redis cache](08-cache.md)                       | 2600 RPS |

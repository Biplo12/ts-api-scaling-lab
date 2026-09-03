# Starting point

What I decided before writing any code, and what I deliberately left broken.

## Schema

| Decision                    | Why                                         |
| --------------------------- | ------------------------------------------- |
| `org_id` on every table     | every query filters by organization         |
| `bigint identity`, not UUID | sequential ids keep the index small         |
| `timestamptz` everywhere    | plain `timestamp` throws away the time zone |
| Postgres enums              | 4 bytes instead of a string                 |

Adding a value to a Postgres enum is easy. Removing one is not, so the lists were
worth thinking about before loading 7 million rows.

## Postgres settings

Defaults, untouched.

|                |        |
| -------------- | ------ |
| shared_buffers | 128 MB |
| work_mem       | 4 MB   |

The database is 1003 MB, so most of it does not fit in cache.

## Left broken on purpose

- No indexes beyond primary keys and unique constraints.
- Foreign keys with no index. Postgres does not create them for you.
- No pooler, no cache, no metrics.
- Queries written the plain way, N+1 included.

If the first version had been fast there would have been nothing to show.

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

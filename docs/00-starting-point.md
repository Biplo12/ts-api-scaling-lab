# Starting point

What the code looked like before any optimization, and why.

## Schema decisions

| Decision                          | Reason                                |
| --------------------------------- | ------------------------------------- |
| `org_id` on every table           | every query filters by organization   |
| `bigint identity` instead of UUID | sequential IDs keep the index compact |
| `timestamptz` everywhere          | plain `timestamp` loses the time zone |
| Postgres enums                    | 4 bytes instead of a string           |

## Postgres settings

Defaults, nothing touched.

|                |        |
| -------------- | ------ |
| shared_buffers | 128 MB |
| work_mem       | 4 MB   |

The database is 1003 MB, so most of it does not fit in cache.

## Left out on purpose

- No indexes beyond primary keys and unique constraints.
- Foreign keys without indexes. Postgres does not add them by itself.
- No connection pooler, no cache, no metrics.
- Queries written the plain way, N+1 included.

If the first version were fast, there would be nothing to show.

## Stages

|     |                                          | Capacity |
| --- | ---------------------------------------- | -------- |
| 1   | [Baseline](01-baseline.md)               | 1 RPS    |
| 2   | [First index](02-indexes.md)             | 30 RPS   |
| 3   | [Choosing the index](03-index-choice.md) | 120 RPS  |
| 4   | [Removing N+1](04-n-plus-one.md)         | 400 RPS  |

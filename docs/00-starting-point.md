# Starting point

Decisions I made before writing any code, and what I left out on purpose.

Machine, stack, table sizes and endpoints are in the [README](../README.md).

## Schema decisions

**Every table carries org_id.** Even where it could be derived by joining. Every
query filters by organization, so I want that column at hand.

**IDs are bigint identity, not UUID.** They grow in order, so new rows land at
the end of the index. Random UUIDs would scatter writes across the whole index
and make it grow faster. I plan to measure this difference later.

**Timestamps are timestamptz.** Plain timestamp loses the time zone. It is the
kind of mistake that only hurts months later.

**Enums are Postgres enums.** They take 4 bytes instead of a string. Adding a
value later is easy, removing one is not, so I fixed the lists up front.

## Postgres settings

Defaults, nothing touched.

|                |        |
| -------------- | ------ |
| shared_buffers | 128 MB |
| work_mem       | 4 MB   |

The database is 1003 MB, so most of it does not fit in the cache. Raising this is
one of the things I will measure.

## Missing on purpose

None of this is an oversight.

- **No indexes** beyond primary keys and unique constraints.
- **Foreign keys have no indexes.** Postgres does not create them by itself. This
  is what makes the first measurements so bad.
- **No connection pooler.**
- **No cache.**
- **No metrics.**
- **Queries written the plain way**, N+1 included.

The project is about the path from here. If the first version were fast, there
would be nothing to show.

## Stages

| Stage | Notes                                      |
| ----- | ------------------------------------------ |
| 1     | [Baseline](01-baseline.md)                 |
| 2     | Indexes (next)                             |

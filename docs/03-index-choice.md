# Stage 3: Choosing the right index

Goal: index tasks.project_id and measure. It turned into four attempts.

![Four indexes](img/stage3-index-choice.svg)

## Why this and not the N+1

Stage 2 left the task list at 82 ms. I assumed the 42 queries were the problem.
The plan said otherwise:

```
Parallel Seq Scan on tasks   62 ms
Rows Removed by Filter:      666 636 x 3 workers
Execution Time:              66.8 ms
```

**One query out of 42 was 80 percent of the time.** The other 41 together took
about 15 ms, because the index from stage 2 turned them into Index Only Scans.

Fixing the N+1 first would have been optimizing the wrong thing.

## The query

```sql
WHERE project_id = X ORDER BY created_at DESC LIMIT 20
```

Measured on project 1, which has 73 692 tasks. It matters that this is a big
one: the traffic generator is skewed towards low IDs, so this project gets the
most requests.

## Attempt 1: no index

140 ms. Sequential scan over 2 million rows.

## Attempt 2: index on (project_id)

**326 ms. Worse than no index.**

The plan switched to Bitmap Heap Scan. Postgres found the 73 692 matching rows
through the index, then had to visit 9817 heap blocks in random order and sort
all of them to find the newest 20. A sequential scan reads the same data in
order, which the disk likes better.

An index does not help when the filter is not selective. 73 692 of 2 000 000
rows is 3.7 percent, and that was already too many.

## Attempt 3: index on (project_id, created_at DESC)

53 ms. Better, but the plan still showed a Sort, and it still read all 73 692
rows.

That made no sense. The index has the rows in the order the query wants, so
Postgres should read 20 entries and stop.

## Attempt 4: the NULLS order

`ORDER BY x DESC` in Postgres is short for `ORDER BY x DESC NULLS FIRST`.
Drizzle's `.desc()` generates `DESC NULLS LAST`. The orders do not match, so the
planner cannot use the index for sorting, even though created_at is NOT NULL and
the two are identical in practice.

Proof, same index, only the query changed:

| Query                                | Plan               | Time     |
| ------------------------------------ | ------------------ | -------- |
| `ORDER BY created_at DESC`           | Bitmap Scan + Sort | 53 ms    |
| `ORDER BY created_at DESC NULLS LAST` | Index Scan         | 0.281 ms |

I fixed the index instead of the query, so application code stays plain:

```ts
index('tasks_project_created_idx').on(t.projectId, t.createdAt.desc().nullsFirst())
```

```sql
CREATE INDEX "tasks_project_created_idx"
  ON "tasks" USING btree ("project_id", "created_at" DESC NULLS FIRST);
```

Result: **0.178 ms**, Index Scan, 20 rows read, no sort. Index size 60 MB.

## The query, all four attempts

| Index                          | Plan               | Time     |
| ------------------------------ | ------------------ | -------- |
| none                           | Seq Scan           | 140 ms   |
| (project_id)                   | Bitmap Scan + Sort | 326 ms   |
| (project_id, created_at DESC NULLS LAST) | Bitmap Scan + Sort | 53 ms |
| (project_id, created_at DESC NULLS FIRST) | Index Scan | 0.178 ms |

## The endpoints

Median of 15 runs.

| Endpoint             | Stage 2 | Stage 3 |
| -------------------- | ------- | ------- |
| /tasks/:id           | 10.9 ms | 13.2 ms |
| /projects/4200/tasks | 82 ms   | 34 ms   |
| /projects/1/tasks    | n/a     | 32 ms   |

The big project and the small project now cost the same. Before this index the
big one would have been ten times slower.

## Under load

| Rate    | Task list median | Task list p95 | Kept up |
| ------- | ---------------- | ------------- | ------- |
| 80 RPS  | 32 ms            | 44 ms         | yes     |
| 120 RPS | 35 ms            | 197 ms        | yes     |
| 150 RPS | 105 ms           | 397 ms        | mostly  |
| 200 RPS | 9110 ms          | 11 470 ms     | no      |

**Capacity: 30 RPS to 120 RPS.**

## What I learned

**An index can make a query slower.**

326 ms with the index against 140 ms without. Bitmap Heap Scan plus random block
access lost to a plain sequential read. "Add an index on the foreign key" is not
always right advice.

**A composite index is useless if the sort order does not match.**

Three of my four attempts read all 73 692 rows. Only the last one read 20. The
difference between attempt 3 and attempt 4 is the words NULLS FIRST, and it is
300x.

**I only found it by reading the plan.**

The 53 ms result looked like a win. The endpoint was faster, the number went
down, I could have moved on. The word `Sort` in the plan is what said something
was still wrong.

**One test run lied to me.**

A 60 RPS run showed p95 of 1.86 s, right after a 200 RPS run had overloaded the
system. Three separate runs at 80 RPS gave p95 of 44.3, 44.8 and 41.4 ms. The
machine needs to settle between tests, and I now run from low rate to high.

## Next

Stage 4: the N+1. The task list is 34 ms and the main query is 0.178 ms of that.
The remaining 41 queries are now the whole cost.

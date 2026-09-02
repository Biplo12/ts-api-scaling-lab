# Stage 3: Choosing the index

Indexed `tasks.project_id`. It took four attempts to get it right.

**Capacity: 30 RPS to 120 RPS.**

![Four indexes](img/stage3-index-choice.svg)

## The problem

I assumed the 42 queries were the bottleneck. The plan said otherwise:

```
Parallel Seq Scan on tasks   62 ms
Rows Removed by Filter:      666 636 x 3 workers
Execution Time:              66.8 ms
```

**One query out of 42 was 80 percent of the time.** The other 41 together took
about 15 ms, because stage 2 turned them into Index Only Scans.

## The query

```sql
WHERE project_id = X ORDER BY created_at DESC LIMIT 20
```

Measured on project 1, which has 73 692 tasks. That matters: the traffic
generator is skewed towards low IDs, so this project gets the most requests.

## Numbers

| Index                                       | Plan               | Time         |
| ------------------------------------------- | ------------------ | ------------ |
| none                                        | Seq Scan           | 140 ms       |
| `(project_id)`                              | Bitmap Scan + Sort | **326 ms**   |
| `(project_id, created_at DESC NULLS LAST)`  | Bitmap Scan + Sort | 53 ms        |
| `(project_id, created_at DESC NULLS FIRST)` | Index Scan         | **0.178 ms** |

The endpoints, median of 15 runs:

| Endpoint             | Stage 2 | Stage 3 |
| -------------------- | ------- | ------- |
| /tasks/:id           | 10.9 ms | 13.2 ms |
| /projects/4200/tasks | 82 ms   | 34 ms   |
| /projects/1/tasks    | ~350 ms | 32 ms   |

The big project and the small one now cost the same.

## The NULLS trap

`ORDER BY x DESC` in Postgres means `DESC NULLS FIRST`. Drizzle's `.desc()`
generates `DESC NULLS LAST`. The orders do not match, so the planner cannot use
the index for sorting, even though `created_at` is NOT NULL and the two are
identical in practice.

Same index, only the query changed:

| Query                                 | Plan               | Time     |
| ------------------------------------- | ------------------ | -------- |
| `ORDER BY created_at DESC`            | Bitmap Scan + Sort | 53 ms    |
| `ORDER BY created_at DESC NULLS LAST` | Index Scan         | 0.281 ms |

I fixed the index instead of the query, so application code stays plain:

```ts
index('tasks_project_created_idx').on(t.projectId, t.createdAt.desc().nullsFirst());
```

## Notes

- An index can make a query slower. 326 ms with it, 140 ms without. Bitmap Heap
  Scan plus random block access lost to a plain sequential read. 73 692 of
  2 000 000 rows was not selective enough.
- A composite index is useless if the sort order does not match. Three of four
  attempts read all 73 692 rows; only the last read 20.
- I found it by reading the plan. The 53 ms result looked like a win. The word
  `Sort` is what said something was still wrong.
- One test run lied. A 60 RPS run showed p95 of 1.86 s right after a 200 RPS run
  had overloaded the machine. Three runs at 80 RPS gave 44.3, 44.8 and 41.4 ms.
  Tests now go from low rate to high, with a pause between them.

Plans: [stage3/](stage3)

## Next

The task list is 34 ms and its main query is 0.178 ms of that. The remaining 41
queries are now the whole cost.

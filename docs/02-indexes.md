# Stage 2: First index

Goal: add one index, on comments.task_id, and measure only that.

![One index](img/stage2-latency.svg)

## Why this one first

Stage 1 showed the task list runs 20 counts over the comments table, one per
task. The table is 666 MB and had no index on task_id, so every count read all
of it.

## The change

```ts
(t) => [index('comments_task_id_idx').on(t.taskId)]
```

Generated SQL:

```sql
CREATE INDEX "comments_task_id_idx" ON "comments" USING btree ("task_id");
```

Built in 3.2 seconds. The index takes 65 MB.

## The query

Counting comments for one task.

|              | Before          | After           |
| ------------ | --------------- | --------------- |
| Plan         | Parallel Seq Scan | Index Only Scan |
| Rows scanned | 5 000 000       | 3               |
| Read         | 435 MB          | 56 kB           |
| Time         | 638 ms          | 0.077 ms        |

`Heap Fetches: 0` in the new plan. The count is answered from the index alone,
the table is never touched.

Plans: [before](stage2/before-count-comments.txt),
[after](stage2/after-count-comments.txt)

## The endpoints

Median of 15 runs, one request at a time.

| Endpoint            | Before  | After   | Faster |
| ------------------- | ------- | ------- | ------ |
| /tasks/:id          | 104 ms  | 10.9 ms | 9.5x   |
| /projects/:id/tasks | 2244 ms | 82 ms   | 27x    |

## Under load

Traffic split 60 / 30 / 10.

| Rate   | Task list median | Task list p95 | Kept up |
| ------ | ---------------- | ------------- | ------- |
| 20 RPS | 88 ms            | 127 ms        | yes     |
| 30 RPS | 132 ms           | 235 ms        | yes     |
| 40 RPS | 1210 ms          | 5330 ms       | no      |

**Capacity: 1 RPS to 30 RPS.**

## What I learned

**One index gave 30x capacity.**

Nothing else changed. Same code, same machine, same data. This is why measuring
one change at a time matters. If I had added five indexes and fixed the N+1 in
one commit, I would not know which part did the work.

**Index Only Scan is the best case, and it happened by luck here.**

The query only needs task_id, which is the indexed column, so Postgres answers
from the index and skips the table. If the count needed any other column, it
would have to fetch rows too and the gain would be smaller.

**The failure mode did not change.**

At 40 RPS there are still zero errors. The system queues instead of refusing,
exactly as at 2 RPS in stage 1. Higher capacity, same problem waiting.

**The task list is still doing 42 queries.**

82 ms is 27 times better, but it is still 42 round trips for one page. That is
the next thing to fix, and it should be cheaper than any index.

## Next

Stage 3: replace the N+1 loops with joins. Two queries instead of 42.

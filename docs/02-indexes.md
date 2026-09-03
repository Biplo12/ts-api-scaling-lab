# Stage 2: First index

One index, on `comments.task_id`. Nothing else changed.

**Capacity: 1 RPS to 30 RPS.**

![One index](img/stage2-latency.svg)

## The problem

The task list runs 20 counts over the comments table, one per task. The table is
666 MB and had no index on `task_id`, so every count read all of it.

## The change

```ts
(t) => [index('comments_task_id_idx').on(t.taskId)];
```

Three seconds to build, 65 MB on disk.

## Numbers

Counting comments for one task:

|              | Before            | After           |
| ------------ | ----------------- | --------------- |
| Plan         | Parallel Seq Scan | Index Only Scan |
| Rows scanned | 5 000 000         | 3               |
| Read         | 435 MB            | 56 kB           |
| Time         | 638 ms            | 0.077 ms        |

The endpoints, median of 15 runs:

| Endpoint            | Before  | After   |
| ------------------- | ------- | ------- |
| /tasks/:id          | 104 ms  | 10.9 ms |
| /projects/:id/tasks | 2244 ms | 82 ms   |

Under load the task list held 132 ms median at 30 RPS. At 40 it gave up.

## Notes

Thirty times the capacity from one index. Nothing else was touched, which is the
whole reason for measuring one change at a time.

`Heap Fetches: 0` means the count is answered from the index alone and the table
is never opened. That happened by luck here: the query needs only `task_id`,
which is the indexed column. If it needed anything else the gain would be
smaller.

The way it fails has not changed. At 40 RPS there are still zero errors, the
server just queues.

The task list still runs 42 queries for one page.

Plans: [before](stage2/before-count-comments.txt),
[after](stage2/after-count-comments.txt)

## Next

The big query is now the task list itself, still a sequential scan over 2 million
rows.

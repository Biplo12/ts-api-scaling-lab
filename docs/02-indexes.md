# Stage 2: First index

Added one index, on `comments.task_id`, and measured only that.

**Capacity: 1 RPS to 30 RPS.**

![One index](img/stage2-latency.svg)

## The problem

The task list runs 20 counts over the comments table, one per task. The table is
666 MB and had no index on `task_id`, so every count read all of it.

## The change

```ts
(t) => [index('comments_task_id_idx').on(t.taskId)];
```

Built in 3.2 seconds, takes 65 MB.

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

Under load the task list held 132 ms median at 30 RPS. At 40 RPS it stopped
keeping up.

## Notes

- One index gave 30x capacity. Nothing else changed, which is why measuring one
  change at a time is worth the extra runs.
- `Heap Fetches: 0` means the count is answered from the index alone. That
  worked here by luck: the query only needs `task_id`, which is the indexed
  column.
- The failure mode did not change. At 40 RPS there are still zero errors, the
  system just queues.
- The task list still runs 42 queries for one page.

Plans: [before](stage2/before-count-comments.txt),
[after](stage2/after-count-comments.txt)

## Next

The remaining big query is the task list itself, still a sequential scan over
2 million rows.

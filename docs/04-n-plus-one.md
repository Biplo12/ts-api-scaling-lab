# Stage 4: Removing N+1

Replaced the query loops with joins and one batched count.

**Capacity: 120 RPS to 400 RPS.**

![Capacity](img/capacity.svg)

## The problem

The task list ran 42 queries: one for the project, one for the tasks, then two
per task inside a loop.

```ts
for (const task of tasks) {
  const assignee = await db.query.users.findFirst(...);
  const [commentCount] = await db.select({ value: count() })...;
}
```

After stage 3 each of those was fast. The main query was 0.178 ms out of 34 ms
total. The cost was the 41 round trips.

## The change

The assignee comes from a join. The comment counts come from one grouped query
for all 20 tasks:

```ts
.select({ taskId: schema.comments.taskId, total: count() })
.where(inArray(schema.comments.taskId, taskIds))
.groupBy(schema.comments.taskId)
```

`/tasks/:id` got the same treatment. Comment authors arrive with the comments
instead of one query each.

## Numbers

| Endpoint            | Queries before | After |
| ------------------- | -------------- | ----- |
| /projects/:id/tasks | 42             | 3     |
| /tasks/:id          | 15             | 2     |

Median of 15 runs:

| Endpoint             | Stage 3 | Stage 4 |
| -------------------- | ------- | ------- |
| /tasks/:id           | 13.2 ms | 5.2 ms  |
| /projects/4200/tasks | 34 ms   | 6.0 ms  |
| /projects/1/tasks    | 32 ms   | 5.9 ms  |

Under load:

| Rate    | Task list p95 | Kept up        |
| ------- | ------------- | -------------- |
| 200 RPS | 13.3 ms       | yes            |
| 400 RPS | 8.2 ms        | yes            |
| 600 RPS | 108.9 ms      | no, dropped 94 |

## Notes

The join kept the index from stage 3, which was worth checking. Adding a join can
make the planner pick a different path:

```
Nested Loop Left Join
  -> Index Scan using tasks_project_created_idx (20 rows)
  -> Index Scan using users_pkey (12 loops)
Execution Time: 3.470 ms
```

Cheapest stage so far. No new indexes, nothing added to the database, two
rewritten queries.

400 RPS gave p95 of 8.2 ms while 200 RPS gave 13.3 ms. Warm cache, and another
reminder that one run means little.

The failure mode still has not changed. At 600 RPS requests are dropped by the
load generator, not refused by the server.

Plan: [stage4/join-plan.txt](stage4/join-plan.txt)

## Next

The server runs on one core out of six.

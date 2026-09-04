# Stage 5: All cores

Four Node processes instead of one.

**Capacity: 400 RPS to 1200 RPS.**

![p95 by process count](img/stage5-cluster.svg)

## The problem

At 400 RPS the database was doing nothing. Six of ten pool connections were free
and nothing was waiting. Event loop lag showed 10 ms, which is the resolution of
the prom-client sampler, so it told me nothing. CPU per process did:

|           | Cores |
| --------- | ----- |
| node      | 1.16  |
| k6        | 0.40  |
| available | 6     |

One process had filled its thread. Four and a half cores were idle.

## The change

```ts
if (WORKERS > 1 && cluster.isPrimary) {
  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }
}
```

Every worker listens on the same port. The OS decides which one gets a
connection. `WORKERS` lives in `.env`.

## Numbers

Task list p95, with the requests k6 gave up on:

| Workers | 400 RPS | 800 RPS             | 1200 RPS                |
| ------- | ------- | ------------------- | ----------------------- |
| 1       | 9 ms    | 792 ms, 656 dropped | 1460 ms, 10 082 dropped |
| 2       | 7 ms    | 49 ms, 64 dropped   | 1020 ms, 2511 dropped   |
| 4       | 6 ms    | 14 ms, 120 dropped  | 46 ms, 70 dropped       |
| 6       | 6 ms    | 12 ms, 0 dropped    | 176 ms, 649 dropped     |

Four workers above 1200:

| Asked for | Delivered | p95     |
| --------- | --------- | ------- |
| 1400      | 1222      | 1280 ms |
| 1600      | 1253      | 1480 ms |
| 1800      | 1285      | 1280 ms |

CPU with four workers at 1200:

| Process     | Cores |
| ----------- | ----- |
| worker 1    | 0.97  |
| worker 2    | 0.77  |
| worker 3    | 0.72  |
| worker 4    | 0.67  |
| node, total | 3.13  |
| k6          | 0.86  |

## Notes

Four workers beat six. Six looked better at 800 RPS and lost at 1200, 176 ms
against 46. Postgres and k6 need cores too, and there are only six.

Four times the processes gave three times the throughput. And 1200 still drops 70
requests, so it is the last rate that holds rather than a clean number.

The busiest worker used 0.97 cores and the quietest 0.67. On Windows the OS hands
out connections and it does not take turns.

`cluster.SCHED_RR` made things worse. With round robin the main process holds the
socket and passes every connection to a worker over IPC. Then the main process is
the bottleneck. At 2000 asked for, throughput went 1198, 956, 710, 739 for 1, 2, 4
and 6 workers. The switch is still in the code behind `SCHED=rr`.

My first attempt at this measurement was useless. `taskkill` did not kill the
server between runs, so all four runs hit the same single-worker process. The
numbers looked like more workers made things slower. Now the script waits for port
3000 to be free before it starts the next server.

Each worker has its own pool. Four workers with ten connections each is 40 to
Postgres, and Postgres allows 100.

## Next

The server still refuses nothing when it is overloaded.

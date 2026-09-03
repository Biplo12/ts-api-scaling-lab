import cluster from 'node:cluster';
import { buildApp } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const WORKERS = Number(process.env.WORKERS) || 1;
const PROFILE_MS = Number(process.env.PROFILE_MS) || 0;

if (WORKERS > 1 && cluster.isPrimary) {
  if (process.env.SCHED === 'rr') {
    cluster.schedulingPolicy = cluster.SCHED_RR;
  }

  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    process.stdout.write(`worker ${worker.process.pid} exited\n`);
  });
} else {
  const app = await buildApp();

  if (PROFILE_MS > 0) {
    setTimeout(() => {
      process.exit(0);
    }, PROFILE_MS);
  }

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

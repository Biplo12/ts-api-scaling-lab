import Fastify, { type FastifyInstance } from 'fastify';
import healthRoutes from './routes/health.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';

export async function buildApp(): Promise<FastifyInstance> {
  const level = process.env.LOG_LEVEL ?? 'info';
  const quiet = level === 'error' || level === 'silent';

  const app = Fastify({
    logger: { level },
    disableRequestLogging: quiet,
  });

  await app.register(healthRoutes);
  await app.register(projectRoutes);
  await app.register(taskRoutes);

  return app;
}

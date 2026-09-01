import Fastify, { type FastifyInstance } from 'fastify';
import { httpDuration, registry } from './metrics.js';
import healthRoutes from './routes/health.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  app.addHook('onResponse', (request, reply, done) => {
    httpDuration.observe(
      {
        method: request.method,
        route: request.routeOptions.url ?? 'unknown',
        status: String(reply.statusCode),
      },
      reply.elapsedTime / 1000,
    );
    done();
  });

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return await registry.metrics();
  });

  await app.register(healthRoutes);
  await app.register(projectRoutes);
  await app.register(taskRoutes);

  return app;
}

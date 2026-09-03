import Fastify, { type FastifyInstance } from 'fastify';
import { httpDuration, registry, shedTotal } from './metrics.js';
import { inflight, MAX_INFLIGHT } from './inflight.js';
import healthRoutes from './routes/health.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';

declare module 'fastify' {
  interface FastifyRequest {
    counted: boolean;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  const shedding = process.env.SHEDDING !== 'off';

  app.decorateRequest('counted', false);

  app.addHook('onRequest', (request, reply, done) => {
    if (request.url === '/metrics' || request.url === '/health') {
      done();
      return;
    }

    if (shedding && inflight.current >= MAX_INFLIGHT) {
      inflight.shed++;
      shedTotal.inc();
      reply.status(503).header('retry-after', '1').send({ error: 'Server overloaded' });
      return;
    }

    request.counted = true;
    inflight.current++;
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    if (request.counted) {
      inflight.current--;
    }

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

import Fastify from 'fastify';

const PORT = Number(process.env.PORT) || 3000;

const fastify = Fastify({
  logger: true,
});

fastify.get('/', (request, reply) => {
  return { hello: 'world' };
});

const start = async () => {
  try {
    await fastify.listen({ port: PORT });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

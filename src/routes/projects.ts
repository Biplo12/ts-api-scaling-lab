import type { FastifyInstance } from 'fastify';
import { count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

export default async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: number } }>(
    '/projects/:id/tasks',
    { schema: { params: idParams } },
    async (request, reply) => {
      const projectId = request.params.id;

      const [project] = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1);

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const rows = await db
        .select({
          task: schema.tasks,
          assigneeName: schema.users.name,
        })
        .from(schema.tasks)
        .leftJoin(schema.users, eq(schema.users.id, schema.tasks.assigneeId))
        .where(eq(schema.tasks.projectId, projectId))
        .orderBy(desc(schema.tasks.createdAt))
        .limit(20);

      const taskIds = rows.map((r) => r.task.id);

      const counts = taskIds.length
        ? await db
            .select({ taskId: schema.comments.taskId, total: count() })
            .from(schema.comments)
            .where(inArray(schema.comments.taskId, taskIds))
            .groupBy(schema.comments.taskId)
        : [];

      const countByTask = new Map(counts.map((c) => [c.taskId, Number(c.total)]));

      const tasks = rows.map((r) => ({
        ...r.task,
        assigneeName: r.assigneeName,
        commentCount: countByTask.get(r.task.id) ?? 0,
      }));

      return { project, tasks };
    },
  );
}

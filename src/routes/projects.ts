import type { FastifyInstance } from 'fastify';
import { count, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

interface GetProjectTasksParams {
  id: number;
}

export default async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: GetProjectTasksParams }>(
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

      const tasks = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.projectId, projectId))
        .orderBy(desc(schema.tasks.createdAt))
        .limit(20);

      const items = [];
      for (const task of tasks) {
        const assignee = task.assigneeId
          ? await db.query.users.findFirst({ where: eq(schema.users.id, task.assigneeId) })
          : null;

        const [commentCount] = await db
          .select({ value: count() })
          .from(schema.comments)
          .where(eq(schema.comments.taskId, task.id));

        items.push({
          ...task,
          assigneeName: assignee?.name ?? null,
          commentCount: commentCount?.value ?? 0,
        });
      }

      return { project, tasks: items };
    },
  );
}

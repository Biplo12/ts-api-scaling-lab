import type { FastifyInstance } from 'fastify';
import { count, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { cached, cacheKeys } from '../cache.js';
import { idParams } from './schemas.js';

const projectById = db
  .select()
  .from(schema.projects)
  .where(eq(schema.projects.id, sql.placeholder('id')))
  .limit(1)
  .prepare('project_by_id');

const tasksByProject = db
  .select({
    id: schema.tasks.id,
    title: schema.tasks.title,
    status: schema.tasks.status,
    priority: schema.tasks.priority,
    dueDate: schema.tasks.dueDate,
    createdAt: schema.tasks.createdAt,
    assigneeName: schema.users.name,
  })
  .from(schema.tasks)
  .leftJoin(schema.users, eq(schema.users.id, schema.tasks.assigneeId))
  .where(eq(schema.tasks.projectId, sql.placeholder('projectId')))
  .orderBy(desc(schema.tasks.createdAt))
  .limit(20)
  .prepare('tasks_by_project');

const commentCounts = db
  .select({ taskId: schema.comments.taskId, total: count() })
  .from(schema.comments)
  .where(sql`${schema.comments.taskId} = ANY(${sql.placeholder('ids')}::bigint[])`)
  .groupBy(schema.comments.taskId)
  .prepare('comment_counts_by_tasks');

export default async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: number } }>(
    '/projects/:id/tasks',
    { schema: { params: idParams } },
    async (request, reply) => {
      const projectId = request.params.id;

      const [project] = await projectById.execute({ id: projectId });

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const payload = await cached(cacheKeys.projectTasks(projectId), async () => {
        const rows = await tasksByProject.execute({ projectId });
        const taskIds = rows.map((r) => r.id);

        const counts = taskIds.length ? await commentCounts.execute({ ids: taskIds }) : [];
        const countByTask = new Map(counts.map((c) => [c.taskId, Number(c.total)]));

        return {
          project,
          tasks: rows.map((r) => ({ ...r, commentCount: countByTask.get(r.id) ?? 0 })),
        };
      });

      return reply.type('application/json').send(payload);
    },
  );
}

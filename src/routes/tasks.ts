import type { FastifyInstance } from 'fastify';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { cached, cacheKeys, invalidate } from '../cache.js';
import { idParams } from './schemas.js';

const commentBody = {
  type: 'object',
  required: ['content', 'authorId'],
  properties: {
    content: { type: 'string', minLength: 1, maxLength: 5000 },
    authorId: { type: 'integer', minimum: 1 },
  },
} as const;

const taskDetail = db
  .select({
    task: schema.tasks,
    project: schema.projects,
    organization: schema.organizations,
    assignee: schema.users,
  })
  .from(schema.tasks)
  .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
  .innerJoin(schema.organizations, eq(schema.organizations.id, schema.tasks.orgId))
  .leftJoin(schema.users, eq(schema.users.id, schema.tasks.assigneeId))
  .where(eq(schema.tasks.id, sql.placeholder('id')))
  .limit(1)
  .prepare('task_detail');

const taskComments = db
  .select({
    comment: schema.comments,
    authorName: schema.users.name,
  })
  .from(schema.comments)
  .leftJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
  .where(eq(schema.comments.taskId, sql.placeholder('taskId')))
  .orderBy(desc(schema.comments.createdAt))
  .limit(10)
  .prepare('task_comments');

const taskOrg = db
  .select({ id: schema.tasks.id, orgId: schema.tasks.orgId, projectId: schema.tasks.projectId })
  .from(schema.tasks)
  .where(eq(schema.tasks.id, sql.placeholder('id')))
  .limit(1)
  .prepare('task_org');

const userOrg = db
  .select({ id: schema.users.id, orgId: schema.users.orgId })
  .from(schema.users)
  .where(eq(schema.users.id, sql.placeholder('id')))
  .limit(1)
  .prepare('user_org');

export default async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: number } }>(
    '/tasks/:id',
    { schema: { params: idParams } },
    async (request, reply) => {
      const taskId = request.params.id;

      const [row] = await taskDetail.execute({ id: taskId });

      if (!row) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      const payload = await cached(cacheKeys.task(taskId), async () => {
        const commentRows = await taskComments.execute({ taskId });

        return {
          task: row.task,
          project: row.project,
          organization: row.organization,
          assignee: row.assignee,
          comments: commentRows.map((c) => ({ ...c.comment, authorName: c.authorName })),
        };
      });

      return reply.type('application/json').send(payload);
    },
  );

  app.post<{ Params: { id: number }; Body: { content: string; authorId: number } }>(
    '/tasks/:id/comments',
    { schema: { params: idParams, body: commentBody } },
    async (request, reply) => {
      const taskId = request.params.id;
      const { content, authorId } = request.body;

      const [task] = await taskOrg.execute({ id: taskId });

      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      const [author] = await userOrg.execute({ id: authorId });

      if (!author) {
        return reply.status(404).send({ error: 'Author not found' });
      }

      if (author.orgId !== task.orgId) {
        return reply.status(403).send({ error: 'Author is not in the task organization' });
      }

      const [comment] = await db
        .insert(schema.comments)
        .values({
          body: content,
          taskId,
          authorId,
          orgId: task.orgId,
        })
        .returning();

      await invalidate([cacheKeys.task(taskId), cacheKeys.projectTasks(task.projectId)]);

      return reply.status(201).send({ comment });
    },
  );
}

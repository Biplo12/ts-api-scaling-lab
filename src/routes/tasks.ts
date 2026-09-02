import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

const commentBody = {
  type: 'object',
  required: ['content', 'authorId'],
  properties: {
    content: { type: 'string', minLength: 1, maxLength: 5000 },
    authorId: { type: 'integer', minimum: 1 },
  },
} as const;

export default async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: number } }>(
    '/tasks/:id',
    { schema: { params: idParams } },
    async (request, reply) => {
      const taskId = request.params.id;

      const [row] = await db
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
        .where(eq(schema.tasks.id, taskId))
        .limit(1);

      if (!row) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      const commentRows = await db
        .select({
          comment: schema.comments,
          authorName: schema.users.name,
        })
        .from(schema.comments)
        .leftJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
        .where(eq(schema.comments.taskId, taskId))
        .orderBy(desc(schema.comments.createdAt))
        .limit(10);

      return {
        task: row.task,
        project: row.project,
        organization: row.organization,
        assignee: row.assignee,
        comments: commentRows.map((c) => ({ ...c.comment, authorName: c.authorName })),
      };
    },
  );

  app.post<{ Params: { id: number }; Body: { content: string; authorId: number } }>(
    '/tasks/:id/comments',
    { schema: { params: idParams, body: commentBody } },
    async (request, reply) => {
      const taskId = request.params.id;
      const { content, authorId } = request.body;

      const [task] = await db
        .select({ id: schema.tasks.id, orgId: schema.tasks.orgId })
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId))
        .limit(1);

      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      const [author] = await db
        .select({ id: schema.users.id, orgId: schema.users.orgId })
        .from(schema.users)
        .where(eq(schema.users.id, authorId))
        .limit(1);

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

      return reply.status(201).send({ comment });
    },
  );
}

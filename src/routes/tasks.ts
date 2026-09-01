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

interface GetTaskParams {
  id: number;
}

export default async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: GetTaskParams }>(
    '/tasks/:id',
    { schema: { params: idParams } },
    async (request, reply) => {
      const taskId = request.params.id;

      const task = await db.query.tasks.findFirst({
        where: eq(schema.tasks.id, taskId),
      });

      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      const project = await db.query.projects.findFirst({
        where: eq(schema.projects.id, task.projectId),
      });

      const organization = await db.query.organizations.findFirst({
        where: eq(schema.organizations.id, task.orgId),
      });

      const assignee = task.assigneeId
        ? await db.query.users.findFirst({ where: eq(schema.users.id, task.assigneeId) })
        : null;

      const comments = await db
        .select()
        .from(schema.comments)
        .where(eq(schema.comments.taskId, taskId))
        .orderBy(desc(schema.comments.createdAt))
        .limit(10);

      const withAuthors = [];
      for (const comment of comments) {
        const author = await db.query.users.findFirst({
          where: eq(schema.users.id, comment.authorId),
        });
        withAuthors.push({ ...comment, authorName: author?.name ?? null });
      }

      return { task, project, organization, assignee, comments: withAuthors };
    },
  );

  interface CreateCommentForTaskParams {
    id: number;
  }
  interface CreateCommentForTaskBody {
    content: string;
    authorId: number;
  }

  app.post<{ Params: CreateCommentForTaskParams; Body: CreateCommentForTaskBody }>(
    '/tasks/:id/comments',
    { schema: { params: idParams, body: commentBody } },
    async (request, reply) => {
      const taskId = request.params.id;
      const { content, authorId } = request.body;

      const task = await db.query.tasks.findFirst({
        where: eq(schema.tasks.id, taskId),
      });

      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      const author = await db.query.users.findFirst({
        where: eq(schema.users.id, authorId),
      });

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

export const projectShape = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    orgId: { type: 'integer' },
    name: { type: 'string' },
    status: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const organizationShape = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    slug: { type: 'string' },
    plan: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const userShape = {
  type: ['object', 'null'],
  properties: {
    id: { type: 'integer' },
    orgId: { type: 'integer' },
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const taskShape = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    orgId: { type: 'integer' },
    projectId: { type: 'integer' },
    assigneeId: { type: ['integer', 'null'] },
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
    status: { type: 'string' },
    priority: { type: 'string' },
    dueDate: { type: ['string', 'null'], format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const taskInListShape = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    status: { type: 'string' },
    priority: { type: 'string' },
    dueDate: { type: ['string', 'null'], format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    assigneeName: { type: ['string', 'null'] },
    commentCount: { type: 'integer' },
  },
} as const;

export const commentShape = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    orgId: { type: 'integer' },
    taskId: { type: 'integer' },
    authorId: { type: 'integer' },
    body: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    authorName: { type: ['string', 'null'] },
  },
} as const;

export const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

import { Pool, type PoolClient } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const N = {
  orgs: 1_000,
  users: 50_000,
  projects: 20_000,
  members: 200_000,
  tasks: 2_000_000,
  comments: 5_000_000,
};

let s = 42;
function rng(): number {
  s |= 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function skewed(max: number, power = 3): number {
  return Math.floor(Math.pow(rng(), power) * max) + 1;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

const START = Date.parse('2024-01-01T00:00:00Z');
const SPAN = 600 * 24 * 3600 * 1000;

function date(): string {
  return new Date(START + Math.floor(rng() * SPAN)).toISOString();
}

function csv(v: string | number | null): string {
  if (v === null) return '';
  return `"${String(v).replaceAll('"', '""')}"`;
}

async function copy(
  client: PoolClient,
  table: string,
  cols: string[],
  count: number,
  row: (i: number) => (string | number | null)[],
): Promise<void> {
  const t = Date.now();
  const dest = client.query(
    copyFrom(`COPY ${table} (${cols.join(', ')}) FROM STDIN WITH (FORMAT csv)`),
  );
  const src = Readable.from(
    (function* () {
      for (let i = 0; i < count; i++) {
        if (i > 0 && i % 500_000 === 0) {
          process.stdout.write(
            `\r  ${table}: ${i.toLocaleString('en')} / ${count.toLocaleString('en')}`,
          );
        }
        yield row(i).map(csv).join(',') + '\n';
      }
    })(),
  );
  await pipeline(src, dest);
  process.stdout.write(
    `\r  ${table}: ${count.toLocaleString('en')} in ${((Date.now() - t) / 1000).toFixed(1)}s\n`,
  );
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const t0 = Date.now();

  console.log('seeding');

  await client.query(
    'TRUNCATE comments, tasks, project_members, projects, users, organizations RESTART IDENTITY CASCADE',
  );
  await client.query('ALTER TABLE comments SET UNLOGGED');
  await client.query('ALTER TABLE tasks SET UNLOGGED');

  await copy(client, 'organizations', ['name', 'slug', 'plan', 'created_at'], N.orgs, (i) => [
    `Organization ${i + 1}`,
    `org-${i + 1}`,
    pick(['free', 'free', 'free', 'pro', 'pro', 'enterprise']),
    date(),
  ]);

  const usersByOrg: number[][] = Array.from({ length: N.orgs + 1 }, () => []);
  await copy(client, 'users', ['org_id', 'email', 'name', 'role', 'created_at'], N.users, (i) => {
    const orgId = i < N.orgs ? i + 1 : skewed(N.orgs);
    usersByOrg[orgId]!.push(i + 1);
    return [
      orgId,
      `user${i + 1}@example.com`,
      `User ${i + 1}`,
      pick(['member', 'member', 'member', 'admin', 'owner']),
      date(),
    ];
  });

  const projectOrg = new Int32Array(N.projects + 1);
  await copy(client, 'projects', ['org_id', 'name', 'status', 'created_at'], N.projects, (i) => {
    const orgId = i < N.orgs ? i + 1 : skewed(N.orgs);
    projectOrg[i + 1] = orgId;
    return [orgId, `Project ${i + 1}`, pick(['active', 'active', 'active', 'archived']), date()];
  });

  const seen = new Set<string>();
  const pairs: [number, number][] = [];
  let guard = 0;
  while (pairs.length < N.members && guard < N.members * 20) {
    guard++;
    const projectId = skewed(N.projects);
    const orgUsers = usersByOrg[projectOrg[projectId]!]!;
    const userId = orgUsers[Math.floor(rng() * orgUsers.length)]!;
    const key = `${projectId}:${userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([projectId, userId]);
  }

  await copy(
    client,
    'project_members',
    ['project_id', 'user_id', 'role', 'added_at'],
    pairs.length,
    (i) => {
      const [p, u] = pairs[i]!;
      return [p, u, pick(['contributor', 'contributor', 'lead', 'viewer']), date()];
    },
  );

  const taskOrg = new Int32Array(N.tasks + 1);
  await copy(
    client,
    'tasks',
    [
      'org_id',
      'project_id',
      'assignee_id',
      'title',
      'description',
      'status',
      'priority',
      'due_date',
      'created_at',
      'updated_at',
    ],
    N.tasks,
    (i) => {
      const projectId = skewed(N.projects);
      const orgId = projectOrg[projectId]!;
      taskOrg[i + 1] = orgId;
      const orgUsers = usersByOrg[orgId]!;
      const assignee = rng() < 0.7 ? orgUsers[Math.floor(rng() * orgUsers.length)]! : null;
      const created = date();
      return [
        orgId,
        projectId,
        assignee,
        `Task ${i + 1}`,
        rng() < 0.5 ? `Description for task ${i + 1}. Needs to be done.` : null,
        pick(['todo', 'todo', 'in_progress', 'in_review', 'done', 'done', 'cancelled']),
        pick(['low', 'medium', 'medium', 'high', 'urgent']),
        rng() < 0.6 ? date() : null,
        created,
        created,
      ];
    },
  );

  await copy(
    client,
    'comments',
    ['org_id', 'task_id', 'author_id', 'body', 'created_at'],
    N.comments,
    (i) => {
      const taskId = skewed(N.tasks);
      const orgId = taskOrg[taskId]!;
      const orgUsers = usersByOrg[orgId]!;
      return [
        orgId,
        taskId,
        orgUsers[Math.floor(rng() * orgUsers.length)]!,
        `Comment ${i + 1}. Comment body for this task.`,
        date(),
      ];
    },
  );

  await client.query('ALTER TABLE tasks SET LOGGED');
  await client.query('ALTER TABLE comments SET LOGGED');
  await client.query('ANALYZE');

  client.release();
  await pool.end();
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

await main();

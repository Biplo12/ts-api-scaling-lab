import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:3000';

const PROJECTS = 20000;
const TASKS = 2000000;

function skewed(max, power = 3) {
  return Math.floor(Math.pow(Math.random(), power) * max) + 1;
}

export const options = {
  scenarios: {
    load: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 5),
      timeUnit: '1s',
      duration: __ENV.DURATION || '30s',
      preAllocatedVUs: 50,
      maxVUs: 1000,
    },
  },
  thresholds: {
    'http_req_duration{name:listProjectTasks}': ['p(99)<5000'],
    'http_req_duration{name:getTask}': ['p(99)<1000'],
  },
};

function listProjectTasks() {
  const res = http.get(`${BASE}/projects/${skewed(PROJECTS)}/tasks`, {
    tags: { name: 'listProjectTasks' },
  });
  check(res, { 'list ok': (r) => r.status === 200 });
}

function getTask() {
  const res = http.get(`${BASE}/tasks/${skewed(TASKS)}`, {
    tags: { name: 'getTask' },
  });
  check(res, { 'task ok': (r) => r.status === 200 });
}

function addComment() {
  const taskId = skewed(TASKS);

  const task = http.get(`${BASE}/tasks/${taskId}`, {
    tags: { name: 'getTaskBeforeComment' },
  });

  if (task.status !== 200) return;

  const orgId = task.json('task.orgId');

  const res = http.post(
    `${BASE}/tasks/${taskId}/comments`,
    JSON.stringify({ content: `k6 comment ${Date.now()}`, authorId: orgId }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'addComment' },
    },
  );

  check(res, { 'comment created': (r) => r.status === 201 });
}

export default function () {
  const roll = Math.random();

  if (roll < 0.6) {
    listProjectTasks();
  } else if (roll < 0.9) {
    getTask();
  } else {
    addComment();
  }
}

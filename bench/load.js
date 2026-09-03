import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:3000';

const PROJECTS = 20000;
const TASKS = 2000000;

const shed = new Counter('shed_503');
const failed = new Counter('failed_5xx');

function skewed(max, power = 3) {
  return Math.floor(Math.pow(Math.random(), power) * max) + 1;
}

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
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
};

function track(res) {
  if (res.status === 503) {
    shed.add(1);
  } else if (res.status >= 500) {
    failed.add(1);
  }
  check(res, { 'ok or shed': (r) => r.status === 200 || r.status === 201 || r.status === 503 });
}

function listProjectTasks() {
  track(
    http.get(`${BASE}/projects/${skewed(PROJECTS)}/tasks`, {
      tags: { name: 'listProjectTasks' },
    }),
  );
}

function getTask() {
  track(
    http.get(`${BASE}/tasks/${skewed(TASKS)}`, {
      tags: { name: 'getTask' },
    }),
  );
}

function addComment() {
  const taskId = skewed(TASKS);

  const task = http.get(`${BASE}/tasks/${taskId}`, {
    tags: { name: 'getTaskBeforeComment' },
  });

  if (task.status !== 200) {
    track(task);
    return;
  }

  const orgId = task.json('task.orgId');

  track(
    http.post(
      `${BASE}/tasks/${taskId}/comments`,
      JSON.stringify({ content: `k6 comment ${Date.now()}`, authorId: orgId }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'addComment' },
      },
    ),
  );
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

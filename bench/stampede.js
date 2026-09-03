import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const PROJECT = Number(__ENV.PROJECT || 1);

const shed = new Counter('shed_503');

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    hotkey: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 2000),
      timeUnit: '1s',
      duration: __ENV.DURATION || '30s',
      preAllocatedVUs: 100,
      maxVUs: 2000,
    },
  },
};

export default function () {
  const res = http.get(`${BASE}/projects/${PROJECT}/tasks`, { tags: { name: 'hotkey' } });
  if (res.status === 503) {
    shed.add(1);
  }
  check(res, { 'ok or shed': (r) => r.status === 200 || r.status === 503 });
}

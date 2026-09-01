import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:3000';

export const options = {
  scenarios: {
    ceiling: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 2000),
      timeUnit: '1s',
      duration: __ENV.DURATION || '20s',
      preAllocatedVUs: 100,
      maxVUs: 2000,
    },
  },
};

export default function () {
  const res = http.get(`${BASE}/health`, { tags: { name: 'health' } });
  check(res, { 'health ok': (r) => r.status === 200 });
}

import http from 'k6/http';
import { check } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  thresholds: {
    http_req_duration: ['p(95) < 250'],
    http_req_failed: ['rate<0.05'],
  },
  vus: 50,
  duration: '60s',
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const email = `loadtest+${uuidv4()}@af.test`;
  const res = http.post(
    `${BASE}/auth/register`,
    JSON.stringify({ email, password: 'GoodPassword99' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'status is 201': (r) => r.status === 201 });
}

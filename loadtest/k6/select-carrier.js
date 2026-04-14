// Sprint 11 — k6 load test for POST /api/v1/shipments/:id/select-carrier.
// Run: k6 run -e BASE_URL=http://localhost:3000 -e TOKEN=... -e SHIPMENT_ID=... loadtest/k6/select-carrier.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  thresholds: {
    'http_req_duration{expected_response:true}': ['p(95) < 200'],
    http_req_failed: ['rate<0.01'],
  },
  stages: [
    { duration: '15s', target: 50 },
    { duration: '60s', target: 200 },
    { duration: '15s', target: 0 },
  ],
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.TOKEN || '';
const SHIPMENT = __ENV.SHIPMENT_ID || '00000000-0000-0000-0000-000000000000';

export default function () {
  const res = http.post(`${BASE}/api/v1/shipments/${SHIPMENT}/select-carrier`, null, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(res, { 'status is 200': (r) => r.status === 200 });
}

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from './config.js';

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 1000,
      stages: [
        { duration: '2m', target: 50 },    // normal load
        { duration: '2m', target: 100 },   // heavy load
        { duration: '2m', target: 200 },   // stress
        { duration: '2m', target: 400 },   // breaking point
        { duration: '2m', target: 0 },     // recovery check
      ]
    }
  }
};

export default function() {
  const res = http.get(`${BASE_URL}/ping`);
  check(res, {
    'ping: 200 OK': (r) => r.status === 200,
  });
  sleep(1);
}
// Note: During the 400 target stage, monitor for elevated error rates and latency.
// System should recover to < 5% error rate within 60s during the ramp down.

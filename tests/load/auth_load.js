import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, THRESHOLDS } from './config.js';

export const options = {
  thresholds: THRESHOLDS,
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },    // ramp to 50 users
        { duration: '2m', target: 50 },     // hold 50 users for 2 min
        { duration: '30s', target: 100 },   // ramp to 100 users
        { duration: '2m', target: 100 },    // hold 100 users for 2 min
        { duration: '30s', target: 0 },     // ramp down
      ]
    }
  }
};

export default function() {
  // Test OTP send (most common auth call)
  const phone = `+9198${Math.floor(Math.random()*100000000).toString().padStart(8,'0')}`;
  const res = http.post(`${BASE_URL}/auth/send-otp`,
    JSON.stringify({phone_number: phone}),
    {headers: {'Content-Type': 'application/json'}}
  );
  check(res, {
    'OTP send: status 200 or 429': (r) => [200, 429].includes(r.status),
    'OTP send: response < 300ms': (r) => r.timings.duration < 300,
    'OTP send: valid JSON': (r) => r.json() !== null,
  });
  sleep(1);
}

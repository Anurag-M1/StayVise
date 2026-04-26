import http from 'k6/http';
import { check } from 'k6';
import crypto from 'k6/crypto';
import { BASE_URL } from './config.js';

export const options = {
  thresholds: {
    'http_req_duration': ['p(99)<500'],  // webhook must respond < 500ms at p99
    'http_req_failed': ['rate<0.01'],    // < 1% errors
  },
  scenarios: {
    webhook_burst: {
      executor: 'constant-arrival-rate',
      rate: 200,          // 200 requests per second (Meta peak burst)
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    }
  }
};

function generateSignature(payload, secret) {
  return crypto.hmac('sha256', secret, payload, 'hex');
}

export default function() {
  const payload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: "919876543210",
            type: "text",
            text: { body: "Hello StayVise" },
            id: `msg_${Date.now()}_${Math.random()}`
          }]
        }
      }]
    }]
  });
  
  const secret = __ENV.WHATSAPP_APP_SECRET || 'test_secret';
  const sig = generateSignature(payload, secret);
  
  const res = http.post(`${BASE_URL}/webhook/whatsapp`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': `sha256=${sig}`
    }
  });
  
  check(res, {
    'webhook: 200 OK': (r) => r.status === 200,
    'webhook: < 500ms': (r) => r.timings.duration < 500,
  });
}

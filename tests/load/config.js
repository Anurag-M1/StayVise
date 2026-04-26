export const BASE_URL = __ENV.BASE_URL || 'https://staging.stayvise.in/api/v1';
export const THRESHOLDS = {
  http_req_duration: ['p(95)<200', 'p(99)<500'],  // 95% < 200ms, 99% < 500ms
  http_req_failed: ['rate<0.01'],                   // < 1% error rate
  http_reqs: ['rate>100'],                          // > 100 req/s throughput
};

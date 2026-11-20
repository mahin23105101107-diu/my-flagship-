import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.FLAGSHIP_URL || 'http://localhost:3000';
const SDK_KEY = __ENV.FLAGSHIP_SDK_KEY || 'fs_prod_core_commerce_001';

export default function () {
  const snap = http.get(`${BASE_URL}/api/v1/sdk/snapshot`, {
    headers: { 'X-FlagShip-SDK-Key': SDK_KEY },
  });
  check(snap, {
    'snapshot status is 200': (r) => r.status === 200,
    'snapshot contains flags': (r) => JSON.parse(r.body).flags !== undefined,
  });

  const batch = http.post(
    `${BASE_URL}/api/v1/events/batch`,
    JSON.stringify({
      exposures: [
        {
          flagKey: 'new-checkout',
          experimentId: 'exp-checkout-v2',
          userKey: `k6-vu-${__VU}-${__ITER}`,
          variationKey: 'on',
        },
      ],
      conversions: [],
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-FlagShip-SDK-Key': SDK_KEY,
      },
    },
  );
  check(batch, { 'batch accepted 202': (r) => r.status === 202 });
  sleep(0.5);
}

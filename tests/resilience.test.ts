import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { resetDbForTests } from '../server/db.ts';
import { seedDatabase } from '../server/seed.ts';
import { createFlagShipApp } from '../server/app.ts';

let server: Server;
let baseUrl = '';

describe('QA3 Kill-Switch SSE Propagation Across 50 Concurrent SDK Streams', () => {
  beforeAll(async () => {
    const db = resetDbForTests(':memory:');
    seedDatabase(db);
    const { app } = createFlagShipApp(db);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('propagates kill-switch activation to 50 concurrent SSE clients within 5,000 ms at p95', async () => {
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'approver@flagship.dev', password: 'flagship123' }),
    }).then((r) => r.json());
    const token = loginRes.token as string;

    const clientCount = 50;
    const controllers: AbortController[] = [];
    const latencies: number[] = [];
    let triggerTime = 0;

    const streamPromises = Array.from({ length: clientCount }, () => {
      const ac = new AbortController();
      controllers.push(ac);
      return new Promise<void>(async (resolve, reject) => {
        try {
          const resp = await fetch(`${baseUrl}/api/v1/sdk/stream?sdkKey=fs_prod_core_commerce_001`, {
            signal: ac.signal,
          });
          const reader = resp.body!.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            if (buf.includes('event: flag-update')) {
              latencies.push(performance.now() - triggerTime);
              ac.abort();
              resolve();
              return;
            }
          }
          resolve();
        } catch (err) {
          if ((err as Error).name === 'AbortError') resolve();
          else reject(err);
        }
      });
    });

    // Wait briefly so all 50 SSE streams are subscribed
    await new Promise((r) => setTimeout(r, 250));

    triggerTime = performance.now();
    const ksRes = await fetch(`${baseUrl}/api/v1/flags/1/toggle-kill-switch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        environmentId: 3,
        killSwitchActive: true,
        reason: 'QA3 50-client propagation test',
      }),
    });
    expect(ksRes.status).toBe(200);

    await Promise.all(streamPromises);
    expect(latencies.length).toBe(clientCount);

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    console.log(`[QA3 SSE Propagation - 50 clients] min=${latencies[0].toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${latencies[latencies.length - 1].toFixed(2)}ms`);
    expect(p95).toBeLessThan(5000);
  });
});

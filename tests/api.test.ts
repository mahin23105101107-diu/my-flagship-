import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { resetDbForTests } from '../server/db.ts';
import { seedDatabase } from '../server/seed.ts';
import { createFlagShipApp } from '../server/app.ts';

let server: Server;
let baseUrl = '';

async function req(path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = res.status === 204 ? null : await res.json();
  return { status: res.status, body, headers: res.headers };
}

async function loginAs(email: string) {
  const res = await req('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'flagship123' }),
  });
  return res.body.token as string;
}

describe('FlagShip Backend REST API & Governance Integration', () => {
  beforeAll(async () => {
    const db = resetDbForTests(':memory:');
    seedDatabase(db);
    const { app } = createFlagShipApp(db);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns RFC 9457 Problem Details for unauthorized and invalid requests', async () => {
    const unauth = await req('/api/v1/flags');
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get('content-type')).toContain('application/problem+json');
    expect(unauth.body.title).toBe('Authentication Required');
  });

  it('validates flag variation types on creation', async () => {
    const editorToken = await loginAs('editor@flagship.dev');
    const badFlag = await req(
      '/api/v1/flags',
      {
        method: 'POST',
        body: JSON.stringify({
          projectId: 1,
          key: 'bad-num-flag',
          name: 'Bad Num Flag',
          type: 'NUMBER',
          variations: [
            { key: 'a', name: 'A', value: 'not-a-number' },
            { key: 'b', name: 'B', value: 10 },
          ],
        }),
      },
      editorToken,
    );
    expect(badFlag.status).toBe(400);
    expect(badFlag.body.title).toBe('Variation Type Mismatch');
  });

  it('enforces Production approval workflow, prevents self-approval, and supports rollback', async () => {
    const editorToken = await loginAs('editor@flagship.dev');
    const approverToken = await loginAs('approver@flagship.dev');

    // Submit production change request for flag #1 (new-checkout) in environment #3 (Production)
    const submitRes = await req(
      '/api/v1/targeting/config/1/3',
      {
        method: 'PUT',
        body: JSON.stringify({
          enabled: true,
          rolloutPercentage: 75,
          reason: 'Scale checkout rollout to 75%',
        }),
      },
      editorToken,
    );
    expect(submitRes.status).toBe(202);
    expect(submitRes.body.status).toBe('PENDING_APPROVAL');
    const crId = submitRes.body.changeRequestId;

    // Even if an approver authored a CR, they cannot approve their own CR
    const selfCrRes = await req(
      '/api/v1/targeting/config/1/3',
      {
        method: 'PUT',
        body: JSON.stringify({ enabled: true, rolloutPercentage: 80, reason: 'Self authored CR' }),
      },
      approverToken,
    );
    const selfApprove = await req(
      `/api/v1/approvals/${selfCrRes.body.changeRequestId}/approve`,
      { method: 'POST', body: JSON.stringify({}) },
      approverToken,
    );
    expect(selfApprove.status).toBe(403);
    expect(selfApprove.body.title).toBe('Self-Approval Forbidden');

    // Peer approver approves editor's CR
    const approveRes = await req(
      `/api/v1/approvals/${crId}/approve`,
      { method: 'POST', body: JSON.stringify({ comment: 'LGTM' }) },
      approverToken,
    );
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');

    // Verify new rollout is active in snapshot
    const snap = await req('/api/v1/sdk/snapshot', {
      headers: { 'X-FlagShip-SDK-Key': 'fs_prod_core_commerce_001' },
    });
    expect(snap.body.flags['new-checkout'].rolloutPercentage).toBe(75);

    // Rollback to version #1
    const versions = await req('/api/v1/versions?flagId=1', {}, approverToken);
    const oldest = versions.body.items[versions.body.items.length - 1];
    const rbRes = await req(
      `/api/v1/versions/${oldest.id}/rollback`,
      { method: 'POST', body: JSON.stringify({ reason: 'Test rollback' }) },
      approverToken,
    );
    expect(rbRes.status).toBe(200);
    expect(rbRes.body.status).toBe('ROLLED_BACK');
  });

  it('ingests batched SDK events and detects stale flags in Flag Hygiene', async () => {
    const adminToken = await loginAs('admin@flagship.dev');
    const batch = await req('/api/v1/events/batch', {
      method: 'POST',
      headers: { 'X-FlagShip-SDK-Key': 'fs_prod_core_commerce_001' },
      body: JSON.stringify({
        exposures: [{ flagKey: 'new-checkout', experimentId: 'exp-checkout-v2', userKey: 't-1', variationKey: 'on' }],
        conversions: [{ flagKey: 'new-checkout', experimentId: 'exp-checkout-v2', eventName: 'checkout_completed', userKey: 't-1', variationKey: 'on' }],
      }),
    });
    expect(batch.status).toBe(202);

    const hygiene = await req('/api/v1/analytics/hygiene', {}, adminToken);
    expect(hygiene.status).toBe(200);
    const keys = hygiene.body.items.map((i: { flagKey: string }) => i.flagKey);
    expect(keys).toContain('legacy-tax-calculator');
    expect(keys).toContain('instant-sepa-rails');
  });
});

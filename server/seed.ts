import type { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

function generateSdkKey(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

export function seedDatabase(db: DatabaseSync): void {
  const existingRoles = db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number };
  if (existingRoles.c > 0) return;

  // 1. Seed Roles
  const insertRole = db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)');
  insertRole.run('VIEWER', 'Read-only access to flags, rules, analytics, and audit logs.');
  insertRole.run('EDITOR', 'Create and edit flags, segments, and rules; submit production change requests.');
  insertRole.run('APPROVER', 'Review and approve/reject production change requests; trigger emergency kill switches.');
  insertRole.run('ADMIN', 'Full platform administration including users, roles, projects, and environments.');

  const getRoleId = (name: string) =>
    (db.prepare('SELECT id FROM roles WHERE name = ?').get(name) as { id: number }).id;

  // 2. Seed Users (passwords hashed with BCrypt)
  const defaultHash = bcrypt.hashSync('flagship123', 10);
  const insertUser = db.prepare(
    'INSERT INTO users (email, name, password_hash, role_id) VALUES (?, ?, ?, ?)',
  );
  insertUser.run('admin@flagship.dev', 'Aria Vance', defaultHash, getRoleId('ADMIN'));
  insertUser.run('approver@flagship.dev', 'Marcus Chen', defaultHash, getRoleId('APPROVER'));
  insertUser.run('editor@flagship.dev', 'Elena Rostova', defaultHash, getRoleId('EDITOR'));
  insertUser.run('viewer@flagship.dev', 'Devon Brooks', defaultHash, getRoleId('VIEWER'));

  const adminId = (db.prepare("SELECT id FROM users WHERE email = 'admin@flagship.dev'").get() as { id: number }).id;
  const approverId = (db.prepare("SELECT id FROM users WHERE email = 'approver@flagship.dev'").get() as { id: number }).id;
  const editorId = (db.prepare("SELECT id FROM users WHERE email = 'editor@flagship.dev'").get() as { id: number }).id;
  const viewerId = (db.prepare("SELECT id FROM users WHERE email = 'viewer@flagship.dev'").get() as { id: number }).id;

  // 3. Seed Projects
  const insertProject = db.prepare(
    'INSERT INTO projects (key, name, description, owner_id) VALUES (?, ?, ?, ?)',
  );
  const p1 = Number(
    insertProject.run(
      'core-commerce',
      'Core Commerce Platform',
      'Checkout, pricing engine, and storefront personalization flags.',
      adminId,
    ).lastInsertRowid,
  );
  const p2 = Number(
    insertProject.run(
      'mobile-banking',
      'Mobile Banking API',
      'Authentication, instant transfers, and card controls.',
      approverId,
    ).lastInsertRowid,
  );

  const insertMember = db.prepare(
    'INSERT INTO project_members (project_id, user_id, role_name) VALUES (?, ?, ?)',
  );
  for (const pid of [p1, p2]) {
    insertMember.run(pid, adminId, 'ADMIN');
    insertMember.run(pid, approverId, 'APPROVER');
    insertMember.run(pid, editorId, 'EDITOR');
    insertMember.run(pid, viewerId, 'VIEWER');
  }

  // 4. Seed Environments
  const insertEnv = db.prepare(
    'INSERT INTO environments (project_id, key, name, sdk_key, require_approval, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const p1Dev = Number(insertEnv.run(p1, 'development', 'Development', 'fs_dev_core_commerce_001', 0, 1).lastInsertRowid);
  const p1Stg = Number(insertEnv.run(p1, 'staging', 'Staging', 'fs_stg_core_commerce_001', 0, 2).lastInsertRowid);
  const p1Prod = Number(insertEnv.run(p1, 'production', 'Production', 'fs_prod_core_commerce_001', 1, 3).lastInsertRowid);

  const p2Dev = Number(insertEnv.run(p2, 'development', 'Development', generateSdkKey('fs_dev'), 0, 1).lastInsertRowid);
  const p2Stg = Number(insertEnv.run(p2, 'staging', 'Staging', generateSdkKey('fs_stg'), 0, 2).lastInsertRowid);
  const p2Prod = Number(insertEnv.run(p2, 'production', 'Production', generateSdkKey('fs_prod'), 1, 3).lastInsertRowid);

  // 5. Seed User Segments
  const insertSeg = db.prepare(
    'INSERT INTO user_segments (project_id, key, name, description, root_rule_json) VALUES (?, ?, ?, ?, ?)',
  );
  insertSeg.run(
    p1,
    'beta-testers',
    'Beta Program & Internal Staff',
    'Internal flagship.dev employees or users opted into beta.',
    JSON.stringify({
      kind: 'GROUP',
      operator: 'OR',
      children: [
        { kind: 'CONDITION', attribute: 'email', operator: 'REGEX', value: '^.*@flagship\\.dev$' },
        { kind: 'CONDITION', attribute: 'betaOptIn', operator: 'EQUALS', value: 'true' },
      ],
    }),
  );
  insertSeg.run(
    p1,
    'enterprise-modern-app',
    'Enterprise Modern App Users',
    'Enterprise tier accounts running mobile/web v2.4.0 or newer.',
    JSON.stringify({
      kind: 'GROUP',
      operator: 'AND',
      children: [
        { kind: 'CONDITION', attribute: 'plan', operator: 'IN', value: 'enterprise,vip' },
        { kind: 'CONDITION', attribute: 'appVersion', operator: 'SEMVER_GREATER_THAN', value: '2.4.0' },
      ],
    }),
  );
  insertSeg.run(
    p2,
    'high-trust-kyc',
    'Verified Tier-2 KYC Users',
    'Users verified before 2026-11-01 in EU/NA regions.',
    JSON.stringify({
      kind: 'GROUP',
      operator: 'AND',
      children: [
        { kind: 'CONDITION', attribute: 'region', operator: 'IN', value: 'US,CA,DE,UK' },
        { kind: 'CONDITION', attribute: 'kycVerifiedAt', operator: 'DATE_BEFORE', value: '2026-11-01T00:00:00Z' },
      ],
    }),
  );

  // 6. Seed Feature Flags + Variations + Configurations
  const nowIso = new Date().toISOString();
  const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

  const insertFlag = db.prepare(`
    INSERT INTO feature_flags (
      project_id, key, name, description, type, owner_id,
      default_variation_key, off_variation_key, experiment_active, experiment_id,
      conversion_event_name, last_evaluated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVar = db.prepare(
    'INSERT INTO flag_variations (flag_id, key, name, value_json, sort_order) VALUES (?, ?, ?, ?, ?)',
  );
  const insertCfg = db.prepare(`
    INSERT INTO flag_configurations (
      flag_id, environment_id, enabled, kill_switch_active,
      default_variation_key, off_variation_key, rollout_percentage,
      rollout_variation_key, rollout_allocations_json, version, full_rollout_since
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRule = db.prepare(
    'INSERT INTO targeting_rules (flag_configuration_id, name, priority, variation_key, root_rule_json) VALUES (?, ?, ?, ?, ?)',
  );
  const insertTarget = db.prepare(
    'INSERT INTO flag_targets (flag_configuration_id, user_key, variation_key) VALUES (?, ?, ?)',
  );
  const insertVersion = db.prepare(
    'INSERT INTO flag_versions (flag_id, environment_id, version, snapshot_json, author_id, reason) VALUES (?, ?, ?, ?, ?, ?)',
  );

  // Flag 1: new-checkout (BOOLEAN, active experiment, 25% rollout in Prod)
  const f1 = Number(
    insertFlag.run(
      p1,
      'new-checkout',
      'One-Click Express Checkout',
      'Streamlined single-page checkout flow with saved payment tokens.',
      'BOOLEAN',
      editorId,
      'off',
      'off',
      1,
      'exp-checkout-v2',
      'checkout_completed',
      nowIso,
      daysAgo(12),
      nowIso,
    ).lastInsertRowid,
  );
  insertVar.run(f1, 'on', 'Enabled (Express)', JSON.stringify(true), 1);
  insertVar.run(f1, 'off', 'Control (Classic)', JSON.stringify(false), 2);

  insertCfg.run(f1, p1Dev, 1, 0, 'off', 'off', 100, 'on', null, 3, null);
  insertCfg.run(f1, p1Stg, 1, 0, 'off', 'off', 50, 'on', null, 2, null);
  const f1ProdCfg = Number(
    insertCfg.run(
      f1,
      p1Prod,
      1,
      0,
      'off',
      'off',
      25,
      'on',
      JSON.stringify([
        { variationKey: 'on', weight: 25 },
        { variationKey: 'off', weight: 75 },
      ]),
      4,
      null,
    ).lastInsertRowid,
  );
  insertTarget.run(f1ProdCfg, 'user-vip-101', 'on');
  insertTarget.run(f1ProdCfg, 'qa-smoke-account', 'on');
  insertRule.run(
    f1ProdCfg,
    'Beta & Enterprise Modern App',
    1,
    'on',
    JSON.stringify({
      kind: 'GROUP',
      operator: 'OR',
      children: [
        { kind: 'SEGMENT_REF', segmentKey: 'beta-testers' },
        { kind: 'SEGMENT_REF', segmentKey: 'enterprise-modern-app' },
      ],
    }),
  );
  insertVersion.run(
    f1,
    p1Prod,
    4,
    JSON.stringify({ enabled: true, rolloutPercentage: 25, version: 4 }),
    approverId,
    'Gradual canary expansion from 10% to 25% after healthy p99 latency.',
  );

  // Flag 2: homepage-layout (STRING, multi-variation experiment)
  const f2 = Number(
    insertFlag.run(
      p1,
      'homepage-layout',
      'Homepage Merchandising Layout',
      'Tests grid-editorial vs compact-carousel layout for landing conversions.',
      'STRING',
      adminId,
      'classic',
      'classic',
      1,
      'exp-homepage-hero',
      'add_to_cart',
      nowIso,
      daysAgo(18),
      nowIso,
    ).lastInsertRowid,
  );
  insertVar.run(f2, 'classic', 'Classic Hero', JSON.stringify('classic'), 1);
  insertVar.run(f2, 'editorial', 'Editorial Grid', JSON.stringify('editorial-grid'), 2);
  insertVar.run(f2, 'compact', 'Compact Carousel', JSON.stringify('compact-carousel'), 3);

  insertCfg.run(f2, p1Dev, 1, 0, 'classic', 'classic', 100, 'editorial', null, 2, null);
  insertCfg.run(f2, p1Stg, 1, 0, 'classic', 'classic', 50, 'editorial', null, 2, null);
  insertCfg.run(
    f2,
    p1Prod,
    1,
    0,
    'classic',
    'classic',
    100,
    'editorial',
    JSON.stringify([
      { variationKey: 'classic', weight: 34 },
      { variationKey: 'editorial', weight: 33 },
      { variationKey: 'compact', weight: 33 },
    ]),
    3,
    null,
  );

  // Flag 3: max-cart-items (NUMBER)
  const f3 = Number(
    insertFlag.run(
      p1,
      'max-cart-items',
      'Maximum Cart Item Limit',
      'Dynamic cart ceiling for wholesale vs standard buyers.',
      'NUMBER',
      editorId,
      'standard',
      'standard',
      0,
      null,
      null,
      daysAgo(2),
      daysAgo(20),
      daysAgo(2),
    ).lastInsertRowid,
  );
  insertVar.run(f3, 'standard', 'Standard (25)', JSON.stringify(25), 1);
  insertVar.run(f3, 'wholesale', 'Wholesale (250)', JSON.stringify(250), 2);
  insertCfg.run(f3, p1Dev, 1, 0, 'standard', 'standard', 100, 'wholesale', null, 1, null);
  insertCfg.run(f3, p1Stg, 1, 0, 'standard', 'standard', 0, 'wholesale', null, 1, null);
  const f3ProdCfg = Number(insertCfg.run(f3, p1Prod, 1, 0, 'standard', 'standard', 0, 'wholesale', null, 2, null).lastInsertRowid);
  insertRule.run(
    f3ProdCfg,
    'Enterprise Wholesale Tier',
    1,
    'wholesale',
    JSON.stringify({
      kind: 'GROUP',
      operator: 'AND',
      children: [{ kind: 'CONDITION', attribute: 'plan', operator: 'EQUALS', value: 'enterprise' }],
    }),
  );

  // Flag 4: pricing-banner-config (JSON)
  const f4 = Number(
    insertFlag.run(
      p1,
      'pricing-banner-config',
      'Promotional Banner Config',
      'JSON payload controlling promo banner copy, discount badge, and threshold.',
      'JSON',
      adminId,
      'default-banner',
      'default-banner',
      0,
      null,
      null,
      daysAgo(1),
      daysAgo(10),
      daysAgo(1),
    ).lastInsertRowid,
  );
  insertVar.run(
    f4,
    'default-banner',
    'Standard Shipping',
    JSON.stringify({ headline: 'Free standard shipping over $50', discountPct: 0, theme: 'slate' }),
    1,
  );
  insertVar.run(
    f4,
    'holiday-promo',
    'Holiday 20% Off',
    JSON.stringify({ headline: 'Save 20% on Annual Bundles', discountPct: 20, theme: 'indigo' }),
    2,
  );
  insertCfg.run(f4, p1Dev, 1, 0, 'default-banner', 'default-banner', 100, 'holiday-promo', null, 1, null);
  insertCfg.run(f4, p1Stg, 1, 0, 'default-banner', 'default-banner', 100, 'holiday-promo', null, 1, null);
  insertCfg.run(f4, p1Prod, 1, 0, 'default-banner', 'default-banner', 15, 'holiday-promo', null, 1, null);

  // Flag 5: legacy-tax-calculator (Stale Flag: not evaluated in 42 days)
  const f5 = Number(
    insertFlag.run(
      p1,
      'legacy-tax-calculator',
      'Legacy Tax Rate Engine',
      'Deprecated tax fallback retained after v2 migration.',
      'BOOLEAN',
      editorId,
      'off',
      'off',
      0,
      null,
      null,
      daysAgo(42),
      daysAgo(90),
      daysAgo(42),
    ).lastInsertRowid,
  );
  insertVar.run(f5, 'on', 'Use Legacy Engine', JSON.stringify(true), 1);
  insertVar.run(f5, 'off', 'Use Modern Engine', JSON.stringify(false), 2);
  insertCfg.run(f5, p1Dev, 0, 0, 'off', 'off', 0, 'on', null, 1, null);
  insertCfg.run(f5, p1Stg, 0, 0, 'off', 'off', 0, 'on', null, 1, null);
  insertCfg.run(f5, p1Prod, 0, 0, 'off', 'off', 0, 'on', null, 1, null);

  // Flag 6: instant-sepa-rails (Stale Flag: 100% rolled out for 21 days)
  const f6 = Number(
    insertFlag.run(
      p2,
      'instant-sepa-rails',
      'Instant SEPA Settlement Rails',
      'Routes eligible EU transfers over real-time SEPA Instant.',
      'BOOLEAN',
      approverId,
      'off',
      'off',
      0,
      null,
      null,
      nowIso,
      daysAgo(40),
      daysAgo(21),
    ).lastInsertRowid,
  );
  insertVar.run(f6, 'on', 'Instant Rails Enabled', JSON.stringify(true), 1);
  insertVar.run(f6, 'off', 'Standard Batch SEPA', JSON.stringify(false), 2);
  insertCfg.run(f6, p2Dev, 1, 0, 'off', 'off', 100, 'on', null, 1, daysAgo(25));
  insertCfg.run(f6, p2Stg, 1, 0, 'off', 'off', 100, 'on', null, 1, daysAgo(23));
  insertCfg.run(f6, p2Prod, 1, 0, 'off', 'off', 100, 'on', null, 3, daysAgo(21));

  // Flag 7: new-dashboard (Sample AOP @FeatureFlag guard demo)
  const f7 = Number(
    insertFlag.run(
      p1,
      'new-dashboard',
      'Executive Insights Dashboard',
      'Guards the @FeatureFlag("new-dashboard") Spring Boot sample endpoint.',
      'BOOLEAN',
      adminId,
      'off',
      'off',
      0,
      null,
      null,
      nowIso,
      daysAgo(5),
      nowIso,
    ).lastInsertRowid,
  );
  insertVar.run(f7, 'on', 'Enabled', JSON.stringify(true), 1);
  insertVar.run(f7, 'off', 'Disabled', JSON.stringify(false), 2);
  insertCfg.run(f7, p1Dev, 1, 0, 'off', 'off', 100, 'on', null, 1, null);
  insertCfg.run(f7, p1Stg, 1, 0, 'off', 'off', 100, 'on', null, 1, null);
  insertCfg.run(f7, p1Prod, 1, 0, 'off', 'off', 50, 'on', null, 1, null);

  // 7. Seed a Pending Production Change Request (authored by Elena, awaiting Marcus/Aria)
  db.prepare(`
    INSERT INTO change_requests (
      flag_id, environment_id, author_id, status, title, reason,
      before_snapshot_json, after_snapshot_json
    ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?)
  `).run(
    f1,
    p1Prod,
    editorId,
    'Expand new-checkout rollout from 25% to 50%',
    'Checkout error rate remained < 0.05% across 72h canary window; ready for 50% traffic.',
    JSON.stringify({
      enabled: true,
      killSwitchActive: false,
      rolloutPercentage: 25,
      rolloutVariationKey: 'on',
      rolloutAllocations: [
        { variationKey: 'on', weight: 25 },
        { variationKey: 'off', weight: 75 },
      ],
    }),
    JSON.stringify({
      enabled: true,
      killSwitchActive: false,
      rolloutPercentage: 50,
      rolloutVariationKey: 'on',
      rolloutAllocations: [
        { variationKey: 'on', weight: 50 },
        { variationKey: 'off', weight: 50 },
      ],
    }),
  );

  // 8. Seed Scheduled Change
  const tomorrowIso = new Date(Date.now() + 86400_000).toISOString();
  db.prepare(`
    INSERT INTO scheduled_changes (flag_id, environment_id, author_id, scheduled_for, payload_json, status, reason)
    VALUES (?, ?, ?, ?, ?, 'SCHEDULED', ?)
  `).run(
    f4,
    p1Prod,
    adminId,
    tomorrowIso,
    JSON.stringify({ rolloutPercentage: 100, rolloutVariationKey: 'holiday-promo' }),
    'Holiday campaign global launch at 00:00 UTC.',
  );

  // 9. Seed Connected SDK Instances
  const insertSdk = db.prepare(`
    INSERT INTO sdk_instances (instance_id, environment_id, app_name, sdk_version, transport, status, last_sync_latency_ms, last_heartbeat_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertSdk.run('checkout-svc-pod-7f8b', p1Prod, 'checkout-service', '1.0.0', 'SSE', 'CONNECTED', 18, nowIso);
  insertSdk.run('checkout-svc-pod-2a1c', p1Prod, 'checkout-service', '1.0.0', 'SSE', 'CONNECTED', 22, nowIso);
  insertSdk.run('storefront-bff-9d4e', p1Prod, 'storefront-bff', '1.0.0', 'SSE', 'CONNECTED', 15, nowIso);
  insertSdk.run('payment-worker-4c21', p2Prod, 'sepa-router', '1.0.0', 'POLLING', 'CONNECTED', 110, nowIso);

  // 10. Seed Experiment Exposure & Conversion Events (deterministic realistic stats)
  const insertExp = db.prepare(
    'INSERT INTO exposure_events (project_id, environment_id, flag_key, experiment_id, user_key, variation_key, reason, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insertConv = db.prepare(
    'INSERT INTO conversion_events (project_id, environment_id, flag_key, experiment_id, event_name, user_key, variation_key, value, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );

  // Experiment 1: new-checkout (25% on, 75% off — healthy ratio, strong positive lift)
  for (let i = 1; i <= 400; i++) {
    const varKey = i <= 102 ? 'on' : 'off';
    const userKey = `exp-u-${i}`;
    const ts = daysAgo(i % 7);
    insertExp.run(p1, p1Prod, 'new-checkout', 'exp-checkout-v2', userKey, varKey, 'PERCENTAGE_ROLLOUT', ts);
    // ~24% conversion on 'on' vs ~11% on 'off'
    const converted = varKey === 'on' ? i % 4 === 0 : i % 9 === 0;
    if (converted) {
      insertConv.run(p1, p1Prod, 'new-checkout', 'exp-checkout-v2', 'checkout_completed', userKey, varKey, 89.5, ts);
    }
  }

  // Experiment 2: homepage-layout (34% classic, 33% editorial, 33% compact — deliberate SRM example!)
  for (let i = 1; i <= 300; i++) {
    const varKey = i <= 155 ? 'classic' : i <= 235 ? 'editorial' : 'compact';
    const userKey = `hp-u-${i}`;
    const ts = daysAgo(i % 5);
    insertExp.run(p1, p1Prod, 'homepage-layout', 'exp-homepage-hero', userKey, varKey, 'PERCENTAGE_ROLLOUT', ts);
    const converted = varKey === 'editorial' ? i % 5 === 0 : i % 8 === 0;
    if (converted) {
      insertConv.run(p1, p1Prod, 'homepage-layout', 'exp-homepage-hero', 'add_to_cart', userKey, varKey, 1, ts);
    }
  }

  // 11. Seed Audit Logs
  const insertAudit = db.prepare(
    'INSERT INTO audit_logs (project_id, actor_id, actor_email, action, entity_type, entity_id, summary, diff_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  insertAudit.run(
    p1,
    approverId,
    'approver@flagship.dev',
    'APPROVE_CHANGE_REQUEST',
    'FEATURE_FLAG',
    'new-checkout',
    'Approved 25% canary rollout for new-checkout in Production',
    JSON.stringify({ before: { rolloutPercentage: 10 }, after: { rolloutPercentage: 25 } }),
    daysAgo(1),
  );
  insertAudit.run(
    p1,
    editorId,
    'editor@flagship.dev',
    'SUBMIT_CHANGE_REQUEST',
    'CHANGE_REQUEST',
    '1',
    'Submitted production rollout expansion (25% -> 50%) for new-checkout',
    JSON.stringify({ before: { rolloutPercentage: 25 }, after: { rolloutPercentage: 50 } }),
    nowIso,
  );
  insertAudit.run(
    p2,
    approverId,
    'approver@flagship.dev',
    'UPDATE_ROLLOUT',
    'FEATURE_FLAG',
    'instant-sepa-rails',
    'Completed 100% rollout for instant-sepa-rails in Production',
    JSON.stringify({ before: { rolloutPercentage: 50 }, after: { rolloutPercentage: 100 } }),
    daysAgo(21),
  );
}

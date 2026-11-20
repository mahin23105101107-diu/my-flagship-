import express, { type Request, type Response, type NextFunction } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import {
  evaluateFlag,
  calculateSrm,
  calculateTwoProportionZTest,
  type FlagEvaluationConfig,
  type UserSegmentDefinition,
  type RuleNode,
  type FlagType,
} from '../src/shared/engine.ts';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'VIEWER' | 'EDITOR' | 'APPROVER' | 'ADMIN';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      traceId?: string;
    }
  }
}

const ROLE_LEVEL: Record<AuthUser['role'], number> = {
  VIEWER: 1,
  EDITOR: 2,
  APPROVER: 3,
  ADMIN: 4,
};

function getJwtSecret(): string {
  return (
    process.env.FLAGSHIP_JWT_SECRET ||
    crypto.createHash('sha256').update(`${process.cwd()}:flagship-local-session`).digest('hex')
  );
}

/**
 * RFC 9457 Problem Details response helper.
 */
function sendProblem(
  res: Response,
  status: number,
  slug: string,
  title: string,
  detail: string,
  req: Request,
) {
  res
    .status(status)
    .type('application/problem+json')
    .json({
      type: `https://flagship.dev/problems/${slug}`,
      title,
      status,
      detail,
      instance: req.originalUrl,
      traceId: req.traceId,
    });
}

function writeAudit(
  db: DatabaseSync,
  projectId: number | null,
  user: AuthUser | undefined,
  action: string,
  entityType: string,
  entityId: string | number,
  summary: string,
  diff?: unknown,
) {
  db.prepare(
    `INSERT INTO audit_logs (project_id, actor_id, actor_email, action, entity_type, entity_id, summary, diff_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    projectId,
    user?.id ?? null,
    user?.email ?? 'system@flagship.dev',
    action,
    entityType,
    String(entityId),
    summary,
    diff ? JSON.stringify(diff) : null,
  );
}

/**
 * Observer Pattern: Live SSE stream registry for SDK clients & dashboard subscribers.
 */
class SseUpdateBus {
  private envClients = new Map<number, Set<Response>>();
  private dashboardClients = new Set<Response>();

  subscribeEnv(envId: number, res: Response) {
    if (!this.envClients.has(envId)) {
      this.envClients.set(envId, new Set());
    }
    this.envClients.get(envId)!.add(res);
  }

  unsubscribeEnv(envId: number, res: Response) {
    this.envClients.get(envId)?.delete(res);
  }

  subscribeDashboard(res: Response) {
    this.dashboardClients.add(res);
  }

  unsubscribeDashboard(res: Response) {
    this.dashboardClients.delete(res);
  }

  publishEnvUpdate(envId: number, eventPayload: Record<string, unknown>) {
    const data = `event: flag-update\ndata: ${JSON.stringify({
      ...eventPayload,
      environmentId: envId,
      publishedAt: new Date().toISOString(),
    })}\n\n`;

    const targets = this.envClients.get(envId);
    if (targets) {
      for (const client of targets) {
        try {
          client.write(data);
        } catch {
          targets.delete(client);
        }
      }
    }

    for (const client of this.dashboardClients) {
      try {
        client.write(data);
      } catch {
        this.dashboardClients.delete(client);
      }
    }
  }

  getConnectedCount(): number {
    let count = 0;
    for (const set of this.envClients.values()) count += set.size;
    return count;
  }
}

export function buildEnvironmentSnapshot(db: DatabaseSync, envId: number) {
  const env = db
    .prepare(
      `SELECT e.*, p.key as project_key, p.name as project_name
       FROM environments e JOIN projects p ON p.id = e.project_id
       WHERE e.id = ?`,
    )
    .get(envId) as Record<string, unknown> | undefined;
  if (!env) return null;

  const projectId = Number(env.project_id);
  const segRows = db
    .prepare('SELECT * FROM user_segments WHERE project_id = ?')
    .all(projectId) as Array<Record<string, unknown>>;

  const segments: Record<string, UserSegmentDefinition> = {};
  for (const s of segRows) {
    segments[String(s.key)] = {
      key: String(s.key),
      name: String(s.name),
      rootRule: JSON.parse(String(s.root_rule_json)) as RuleNode,
    };
  }

  const flagRows = db
    .prepare(
      `SELECT f.*, fc.id as cfg_id, fc.enabled, fc.kill_switch_active,
              fc.default_variation_key as cfg_default_var, fc.off_variation_key as cfg_off_var,
              fc.rollout_percentage, fc.rollout_variation_key, fc.rollout_allocations_json, fc.version
       FROM feature_flags f
       JOIN flag_configurations fc ON fc.flag_id = f.id AND fc.environment_id = ?
       WHERE f.project_id = ? AND f.archived = 0`,
    )
    .all(envId, projectId) as Array<Record<string, unknown>>;

  const flags: Record<string, FlagEvaluationConfig> = {};
  for (const f of flagRows) {
    const flagId = Number(f.id);
    const cfgId = Number(f.cfg_id);

    const vars = db
      .prepare('SELECT key, name, value_json FROM flag_variations WHERE flag_id = ? ORDER BY sort_order ASC')
      .all(flagId) as Array<{ key: string; name: string; value_json: string }>;

    const targetRows = db
      .prepare('SELECT user_key, variation_key FROM flag_targets WHERE flag_configuration_id = ?')
      .all(cfgId) as Array<{ user_key: string; variation_key: string }>;
    const individualTargets: Record<string, string> = {};
    for (const t of targetRows) {
      individualTargets[t.user_key] = t.variation_key;
    }

    const ruleRows = db
      .prepare(
        'SELECT id, name, priority, variation_key, root_rule_json FROM targeting_rules WHERE flag_configuration_id = ? ORDER BY priority ASC',
      )
      .all(cfgId) as Array<{
      id: number;
      name: string;
      priority: number;
      variation_key: string;
      root_rule_json: string;
    }>;

    flags[String(f.key)] = {
      flagKey: String(f.key),
      type: String(f.type) as FlagType,
      enabled: Boolean(f.enabled),
      killSwitchActive: Boolean(f.kill_switch_active),
      defaultVariationKey: String(f.cfg_default_var),
      offVariationKey: String(f.cfg_off_var),
      rolloutPercentage: Number(f.rollout_percentage),
      rolloutVariationKey: f.rollout_variation_key ? String(f.rollout_variation_key) : undefined,
      rolloutAllocations: f.rollout_allocations_json
        ? JSON.parse(String(f.rollout_allocations_json))
        : undefined,
      variations: vars.map((v) => ({
        key: v.key,
        name: v.name,
        value: JSON.parse(v.value_json),
      })),
      individualTargets,
      rules: ruleRows.map((r) => ({
        id: String(r.id),
        name: r.name,
        priority: r.priority,
        variationKey: r.variation_key,
        rootRule: JSON.parse(r.root_rule_json) as RuleNode,
      })),
      version: Number(f.version),
    };
  }

  return {
    projectKey: String(env.project_key),
    environmentKey: String(env.key),
    environmentId: envId,
    generatedAt: new Date().toISOString(),
    segments,
    flags,
  };
}

function getConfigSnapshot(db: DatabaseSync, flagId: number, envId: number) {
  const cfg = db
    .prepare('SELECT * FROM flag_configurations WHERE flag_id = ? AND environment_id = ?')
    .get(flagId, envId) as Record<string, unknown> | undefined;
  if (!cfg) return null;
  const rules = db
    .prepare('SELECT name, priority, variation_key, root_rule_json FROM targeting_rules WHERE flag_configuration_id = ? ORDER BY priority ASC')
    .all(Number(cfg.id));
  const targets = db
    .prepare('SELECT user_key, variation_key FROM flag_targets WHERE flag_configuration_id = ?')
    .all(Number(cfg.id));
  return {
    enabled: Boolean(cfg.enabled),
    killSwitchActive: Boolean(cfg.kill_switch_active),
    defaultVariationKey: String(cfg.default_variation_key),
    offVariationKey: String(cfg.off_variation_key),
    rolloutPercentage: Number(cfg.rollout_percentage),
    rolloutVariationKey: cfg.rollout_variation_key ? String(cfg.rollout_variation_key) : null,
    rolloutAllocations: cfg.rollout_allocations_json ? JSON.parse(String(cfg.rollout_allocations_json)) : null,
    rules,
    targets,
  };
}

function applyConfigUpdate(
  db: DatabaseSync,
  bus: SseUpdateBus,
  flagId: number,
  envId: number,
  patch: {
    enabled?: boolean;
    killSwitchActive?: boolean;
    defaultVariationKey?: string;
    offVariationKey?: string;
    rolloutPercentage?: number;
    rolloutVariationKey?: string | null;
    rolloutAllocations?: Array<{ variationKey: string; weight: number }> | null;
  },
  authorId: number,
  reason: string,
) {
  const cfg = db
    .prepare('SELECT * FROM flag_configurations WHERE flag_id = ? AND environment_id = ?')
    .get(flagId, envId) as Record<string, unknown>;
  const flag = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(flagId) as Record<string, unknown>;

  const nextEnabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : Number(cfg.enabled);
  const nextKill =
    patch.killSwitchActive !== undefined ? (patch.killSwitchActive ? 1 : 0) : Number(cfg.kill_switch_active);
  const nextDefault = patch.defaultVariationKey ?? String(cfg.default_variation_key);
  const nextOff = patch.offVariationKey ?? String(cfg.off_variation_key);
  const nextPct =
    patch.rolloutPercentage !== undefined ? patch.rolloutPercentage : Number(cfg.rollout_percentage);
  const nextRollVar =
    patch.rolloutVariationKey !== undefined ? patch.rolloutVariationKey : (cfg.rollout_variation_key as string | null);
  const nextAllocs =
    patch.rolloutAllocations !== undefined
      ? patch.rolloutAllocations
        ? JSON.stringify(patch.rolloutAllocations)
        : null
      : (cfg.rollout_allocations_json as string | null);

  const nextVersion = Number(cfg.version) + 1;
  let fullRolloutSince = cfg.full_rollout_since as string | null;
  if (nextEnabled === 1 && nextKill === 0 && nextPct >= 100) {
    if (!fullRolloutSince) fullRolloutSince = new Date().toISOString();
  } else {
    fullRolloutSince = null;
  }

  db.prepare(
    `UPDATE flag_configurations
     SET enabled = ?, kill_switch_active = ?, default_variation_key = ?, off_variation_key = ?,
         rollout_percentage = ?, rollout_variation_key = ?, rollout_allocations_json = ?,
         version = ?, full_rollout_since = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    nextEnabled,
    nextKill,
    nextDefault,
    nextOff,
    nextPct,
    nextRollVar,
    nextAllocs,
    nextVersion,
    fullRolloutSince,
    Number(cfg.id),
  );

  db.prepare("UPDATE feature_flags SET updated_at = datetime('now') WHERE id = ?").run(flagId);

  const snapshot = getConfigSnapshot(db, flagId, envId);
  db.prepare(
    `INSERT INTO flag_versions (flag_id, environment_id, version, snapshot_json, author_id, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(flagId, envId, nextVersion, JSON.stringify(snapshot), authorId, reason);

  bus.publishEnvUpdate(envId, {
    flagId,
    flagKey: flag.key,
    version: nextVersion,
    killSwitchActive: Boolean(nextKill),
  });

  return { version: nextVersion, snapshot };
}

export function processDueScheduledChanges(db: DatabaseSync, bus: SseUpdateBus): number {
  const nowIso = new Date().toISOString();
  const due = db
    .prepare("SELECT * FROM scheduled_changes WHERE status = 'SCHEDULED' AND scheduled_for <= ?")
    .all(nowIso) as Array<Record<string, unknown>>;

  for (const item of due) {
    const payload = JSON.parse(String(item.payload_json));
    applyConfigUpdate(
      db,
      bus,
      Number(item.flag_id),
      Number(item.environment_id),
      payload,
      Number(item.author_id),
      `Scheduled execution: ${item.reason}`,
    );
    db.prepare("UPDATE scheduled_changes SET status = 'EXECUTED', executed_at = ? WHERE id = ?").run(
      nowIso,
      Number(item.id),
    );
  }
  return due.length;
}

export function createFlagShipApp(db: DatabaseSync) {
  const app = express();
  const bus = new SseUpdateBus();

  app.use(express.json({ limit: '2mb' }));

  // Trace ID & structured request logging middleware
  app.use((req, res, next) => {
    req.traceId = (req.headers['x-trace-id'] as string) || crypto.randomUUID();
    res.setHeader('X-Trace-Id', req.traceId);
    next();
  });

  // Auth middleware
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return sendProblem(res, 401, 'unauthorized', 'Authentication Required', 'Missing Bearer JWT token.', req);
    }
    try {
      const payload = jwt.verify(token, getJwtSecret()) as unknown as { sub: number; email: string; name: string; role: AuthUser['role'] };
      const userRow = db
        .prepare(
          `SELECT u.id, u.email, u.name, u.active, r.name as role
           FROM users u JOIN roles r ON r.id = u.role_id
           WHERE u.id = ?`,
        )
        .get(payload.sub) as (AuthUser & { active: number }) | undefined;
      if (!userRow || !userRow.active) {
        return sendProblem(res, 401, 'invalid-token', 'Invalid Credentials', 'User account is inactive or missing.', req);
      }
      req.user = {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        role: userRow.role,
      };
      next();
    } catch {
      return sendProblem(res, 401, 'invalid-token', 'Invalid Token', 'JWT signature or expiration check failed.', req);
    }
  };

  const requireMinRole = (minRole: AuthUser['role']) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return sendProblem(res, 401, 'unauthorized', 'Authentication Required', 'Missing user context.', req);
      }
      if (ROLE_LEVEL[req.user.role] < ROLE_LEVEL[minRole]) {
        return sendProblem(
          res,
          403,
          'forbidden',
          'Insufficient Permissions',
          `Requires at least ${minRole} role; current role is ${req.user.role}.`,
          req,
        );
      }
      next();
    };
  };

  const ensureProjectAccess = (user: AuthUser, projectId: number): AuthUser['role'] | null => {
    if (user.role === 'ADMIN') return 'ADMIN';
    const membership = db
      .prepare('SELECT role_name FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(projectId, user.id) as { role_name: AuthUser['role'] } | undefined;
    return membership ? membership.role_name : null;
  };

  // ==================== HEALTH & OPENAPI ====================
  app.get('/api/v1/health', (_req, res) => {
    const dbCheck = db.prepare('SELECT 1 as ok').get() as { ok: number };
    const instances = (db.prepare("SELECT COUNT(*) as c FROM sdk_instances WHERE status = 'CONNECTED'").get() as { c: number }).c;
    res.json({
      status: dbCheck.ok === 1 ? 'UP' : 'DOWN',
      service: 'flagship-server',
      uptimeSeconds: Math.floor(process.uptime()),
      connectedSseStreams: bus.getConnectedCount(),
      activeSdkInstances: instances,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.1.0',
      info: {
        title: 'FlagShip API',
        version: '1.0.0',
        description: 'Feature-Flag, Targeting, Gradual Rollout, Approval & Experiment Analytics REST API',
      },
      paths: {
        '/api/v1/auth/login': { post: { summary: 'Authenticate user and issue JWT' } },
        '/api/v1/projects': { get: { summary: 'List accessible projects' }, post: { summary: 'Create project' } },
        '/api/v1/flags': { get: { summary: 'List paginated feature flags' }, post: { summary: 'Create feature flag' } },
        '/api/v1/flags/{id}/evaluate-preview': { post: { summary: 'Preview deterministic flag evaluation' } },
        '/api/v1/sdk/snapshot': { get: { summary: 'Fetch full environment snapshot for SDK' } },
        '/api/v1/sdk/stream': { get: { summary: 'Subscribe to Server-Sent Events live updates' } },
        '/api/v1/approvals/{id}/approve': { post: { summary: 'Approve production change request (no self-approval)' } },
        '/api/v1/analytics/experiments/{flagKey}': { get: { summary: 'Experiment conversion & SRM statistics' } },
        '/api/v1/analytics/hygiene': { get: { summary: 'Identify stale flags (>30d unused or >14d at 100%)' } },
      },
    });
  });

  // ==================== AUTH & TEAM ====================
  app.post('/api/v1/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return sendProblem(res, 400, 'validation-error', 'Validation Error', 'Email and password are required.', req);
    }
    const row = db
      .prepare(
        `SELECT u.id, u.email, u.name, u.password_hash, u.active, r.name as role
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE lower(u.email) = lower(?)`,
      )
      .get(String(email).trim()) as
      | (AuthUser & { password_hash: string; active: number })
      | undefined;

    if (!row || !row.active || !bcrypt.compareSync(String(password), row.password_hash)) {
      return sendProblem(res, 401, 'invalid-credentials', 'Invalid Credentials', 'Incorrect email or password.', req);
    }

    const token = jwt.sign(
      { sub: row.id, email: row.email, name: row.name, role: row.role },
      getJwtSecret(),
      { expiresIn: '12h' },
    );

    res.json({
      token,
      user: { id: row.id, email: row.email, name: row.name, role: row.role },
    });
  });

  app.post('/api/v1/auth/register', (req, res) => {
    const { email, name, password } = req.body || {};
    if (!email || !name || !password || String(password).length < 6) {
      return sendProblem(
        res,
        400,
        'validation-error',
        'Validation Error',
        'Name, valid email, and password (min 6 chars) are required.',
        req,
      );
    }
    const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(String(email).trim());
    if (existing) {
      return sendProblem(res, 409, 'duplicate-email', 'Email Already Registered', 'An account with this email exists.', req);
    }
    const viewerRole = db.prepare("SELECT id FROM roles WHERE name = 'VIEWER'").get() as { id: number };
    const hash = bcrypt.hashSync(String(password), 10);
    const result = db
      .prepare('INSERT INTO users (email, name, password_hash, role_id) VALUES (?, ?, ?, ?)')
      .run(String(email).trim().toLowerCase(), String(name).trim(), hash, viewerRole.id);
    const userId = Number(result.lastInsertRowid);

    // Grant viewer access to existing projects so newly registered reviewers can explore
    const projects = db.prepare('SELECT id FROM projects').all() as Array<{ id: number }>;
    const insertMem = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, role_name) VALUES (?, ?, ?)');
    for (const p of projects) insertMem.run(p.id, userId, 'VIEWER');

    const user: AuthUser = { id: userId, email: String(email).trim().toLowerCase(), name: String(name).trim(), role: 'VIEWER' };
    const token = jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role }, getJwtSecret(), {
      expiresIn: '12h',
    });
    res.status(201).json({ token, user });
  });

  app.get('/api/v1/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  app.get('/api/v1/auth/users', requireAuth, (_req, res) => {
    const users = db
      .prepare(
        `SELECT u.id, u.email, u.name, u.active, u.created_at, r.name as role
         FROM users u JOIN roles r ON r.id = u.role_id
         ORDER BY u.id ASC`,
      )
      .all();
    res.json({ items: users });
  });

  app.post('/api/v1/auth/users', requireAuth, requireMinRole('ADMIN'), (req, res) => {
    const { email, name, password, role } = req.body || {};
    if (!email || !name || !password || !['VIEWER', 'EDITOR', 'APPROVER', 'ADMIN'].includes(role)) {
      return sendProblem(res, 400, 'validation-error', 'Invalid User Payload', 'Provide email, name, password, and valid role.', req);
    }
    const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(String(email).trim());
    if (existing) {
      return sendProblem(res, 409, 'duplicate-email', 'User Exists', 'A user with this email already exists.', req);
    }
    const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(role) as { id: number };
    const hash = bcrypt.hashSync(String(password), 10);
    const id = Number(
      db
        .prepare('INSERT INTO users (email, name, password_hash, role_id) VALUES (?, ?, ?, ?)')
        .run(String(email).trim().toLowerCase(), String(name).trim(), hash, roleRow.id).lastInsertRowid,
    );
    const projects = db.prepare('SELECT id FROM projects').all() as Array<{ id: number }>;
    const insertMem = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, role_name) VALUES (?, ?, ?)');
    for (const p of projects) insertMem.run(p.id, id, role);

    writeAudit(db, null, req.user, 'CREATE_USER', 'USER', id, `Created user ${email} with role ${role}`);
    res.status(201).json({ id, email, name, role });
  });

  app.patch('/api/v1/auth/users/:id/role', requireAuth, requireMinRole('ADMIN'), (req, res) => {
    const userId = Number(req.params.id);
    const { role } = req.body || {};
    if (!['VIEWER', 'EDITOR', 'APPROVER', 'ADMIN'].includes(role)) {
      return sendProblem(res, 400, 'validation-error', 'Invalid Role', 'Role must be VIEWER, EDITOR, APPROVER, or ADMIN.', req);
    }
    const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(role) as { id: number };
    db.prepare("UPDATE users SET role_id = ?, updated_at = datetime('now') WHERE id = ?").run(roleRow.id, userId);
    db.prepare('UPDATE project_members SET role_name = ? WHERE user_id = ?').run(role, userId);
    writeAudit(db, null, req.user, 'UPDATE_USER_ROLE', 'USER', userId, `Updated user #${userId} role to ${role}`);
    res.json({ id: userId, role });
  });

  // ==================== PROJECTS ====================
  app.get('/api/v1/projects', requireAuth, (req, res) => {
    const rows =
      req.user!.role === 'ADMIN'
        ? db
            .prepare(
              `SELECT p.*, u.name as owner_name,
                (SELECT COUNT(*) FROM feature_flags f WHERE f.project_id = p.id AND f.archived = 0) as flag_count,
                (SELECT COUNT(*) FROM environments e WHERE e.project_id = p.id) as env_count
               FROM projects p JOIN users u ON u.id = p.owner_id ORDER BY p.id ASC`,
            )
            .all()
        : db
            .prepare(
              `SELECT p.*, u.name as owner_name, pm.role_name as my_role,
                (SELECT COUNT(*) FROM feature_flags f WHERE f.project_id = p.id AND f.archived = 0) as flag_count,
                (SELECT COUNT(*) FROM environments e WHERE e.project_id = p.id) as env_count
               FROM projects p
               JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
               JOIN users u ON u.id = p.owner_id
               ORDER BY p.id ASC`,
            )
            .all(req.user!.id);
    res.json({ items: rows });
  });

  app.post('/api/v1/projects', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const { key, name, description } = req.body || {};
    if (!key || !name || !/^[a-z0-9-]+$/.test(String(key))) {
      return sendProblem(
        res,
        400,
        'validation-error',
        'Validation Error',
        'Project key (lowercase alphanumeric/hyphens) and name are required.',
        req,
      );
    }
    const exists = db.prepare('SELECT id FROM projects WHERE key = ?').get(key);
    if (exists) {
      return sendProblem(res, 409, 'duplicate-key', 'Duplicate Project Key', `Project '${key}' already exists.`, req);
    }
    const projectId = Number(
      db
        .prepare('INSERT INTO projects (key, name, description, owner_id) VALUES (?, ?, ?, ?)')
        .run(key, String(name).trim(), String(description || ''), req.user!.id).lastInsertRowid,
    );

    // Add creator + admins as members and create default 3 environments
    db.prepare('INSERT INTO project_members (project_id, user_id, role_name) VALUES (?, ?, ?)').run(
      projectId,
      req.user!.id,
      req.user!.role,
    );
    const insEnv = db.prepare(
      'INSERT INTO environments (project_id, key, name, sdk_key, require_approval, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insEnv.run(projectId, 'development', 'Development', `fs_dev_${crypto.randomBytes(8).toString('hex')}`, 0, 1);
    insEnv.run(projectId, 'staging', 'Staging', `fs_stg_${crypto.randomBytes(8).toString('hex')}`, 0, 2);
    insEnv.run(projectId, 'production', 'Production', `fs_prod_${crypto.randomBytes(8).toString('hex')}`, 1, 3);

    writeAudit(db, projectId, req.user, 'CREATE_PROJECT', 'PROJECT', projectId, `Created project ${name} (${key})`);
    const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    res.status(201).json(created);
  });

  app.get('/api/v1/projects/:id/members', requireAuth, (req, res) => {
    const projectId = Number(req.params.id);
    if (!ensureProjectAccess(req.user!, projectId)) {
      return sendProblem(res, 403, 'forbidden', 'Project Access Denied', 'You are not a member of this project.', req);
    }
    const members = db
      .prepare(
        `SELECT pm.id, pm.project_id, pm.user_id, pm.role_name, u.name, u.email
         FROM project_members pm JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = ?`,
      )
      .all(projectId);
    res.json({ items: members });
  });

  app.post('/api/v1/projects/:id/members', requireAuth, requireMinRole('ADMIN'), (req, res) => {
    const projectId = Number(req.params.id);
    const { userId, roleName } = req.body || {};
    if (!userId || !['VIEWER', 'EDITOR', 'APPROVER', 'ADMIN'].includes(roleName)) {
      return sendProblem(res, 400, 'validation-error', 'Invalid Member Payload', 'Provide userId and valid roleName.', req);
    }
    db.prepare(
      `INSERT INTO project_members (project_id, user_id, role_name) VALUES (?, ?, ?)
       ON CONFLICT(project_id, user_id) DO UPDATE SET role_name = excluded.role_name`,
    ).run(projectId, Number(userId), roleName);
    writeAudit(db, projectId, req.user, 'UPSERT_PROJECT_MEMBER', 'PROJECT', projectId, `Assigned user #${userId} as ${roleName}`);
    res.json({ projectId, userId, roleName });
  });

  // ==================== ENVIRONMENTS ====================
  app.get('/api/v1/environments', requireAuth, (req, res) => {
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    let rows: unknown[];
    if (projectId) {
      if (!ensureProjectAccess(req.user!, projectId)) {
        return sendProblem(res, 403, 'forbidden', 'Project Access Denied', 'No access to project.', req);
      }
      rows = db
        .prepare(
          `SELECT e.*, p.key as project_key, p.name as project_name
           FROM environments e JOIN projects p ON p.id = e.project_id
           WHERE e.project_id = ? ORDER BY e.sort_order ASC, e.id ASC`,
        )
        .all(projectId);
    } else {
      rows = db
        .prepare(
          `SELECT e.*, p.key as project_key, p.name as project_name
           FROM environments e JOIN projects p ON p.id = e.project_id
           ORDER BY p.id ASC, e.sort_order ASC`,
        )
        .all();
    }
    res.json({ items: rows });
  });

  app.post('/api/v1/environments', requireAuth, requireMinRole('ADMIN'), (req, res) => {
    const { projectId, key, name, requireApproval } = req.body || {};
    if (!projectId || !key || !name) {
      return sendProblem(res, 400, 'validation-error', 'Validation Error', 'projectId, key, and name are required.', req);
    }
    const sdkKey = `fs_${String(key).slice(0, 4)}_${crypto.randomBytes(8).toString('hex')}`;
    const envId = Number(
      db
        .prepare(
          'INSERT INTO environments (project_id, key, name, sdk_key, require_approval, sort_order) VALUES (?, ?, ?, ?, ?, 10)',
        )
        .run(Number(projectId), String(key).toLowerCase(), String(name).trim(), sdkKey, requireApproval ? 1 : 0)
        .lastInsertRowid,
    );
    // Initialize configurations for all existing flags in the project
    const flags = db.prepare('SELECT id, default_variation_key, off_variation_key FROM feature_flags WHERE project_id = ?').all(Number(projectId)) as Array<{
      id: number;
      default_variation_key: string;
      off_variation_key: string;
    }>;
    const insCfg = db.prepare(
      'INSERT INTO flag_configurations (flag_id, environment_id, enabled, kill_switch_active, default_variation_key, off_variation_key, rollout_percentage) VALUES (?, ?, 0, 0, ?, ?, 0)',
    );
    for (const f of flags) insCfg.run(f.id, envId, f.default_variation_key, f.off_variation_key);

    writeAudit(db, Number(projectId), req.user, 'CREATE_ENVIRONMENT', 'ENVIRONMENT', envId, `Created environment ${name}`);
    res.status(201).json(db.prepare('SELECT * FROM environments WHERE id = ?').get(envId));
  });

  app.patch('/api/v1/environments/:id', requireAuth, requireMinRole('ADMIN'), (req, res) => {
    const envId = Number(req.params.id);
    const { name, requireApproval } = req.body || {};
    const existing = db.prepare('SELECT * FROM environments WHERE id = ?').get(envId) as Record<string, unknown> | undefined;
    if (!existing) return sendProblem(res, 404, 'not-found', 'Not Found', 'Environment not found.', req);
    db.prepare('UPDATE environments SET name = ?, require_approval = ? WHERE id = ?').run(
      String(name ?? existing.name),
      requireApproval !== undefined ? (requireApproval ? 1 : 0) : Number(existing.require_approval),
      envId,
    );
    res.json(db.prepare('SELECT * FROM environments WHERE id = ?').get(envId));
  });

  app.post('/api/v1/environments/:id/rotate-sdk-key', requireAuth, requireMinRole('ADMIN'), (req, res) => {
    const envId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM environments WHERE id = ?').get(envId) as Record<string, unknown> | undefined;
    if (!existing) return sendProblem(res, 404, 'not-found', 'Not Found', 'Environment not found.', req);
    const newKey = `fs_${String(existing.key).slice(0, 4)}_${crypto.randomBytes(10).toString('hex')}`;
    db.prepare('UPDATE environments SET sdk_key = ? WHERE id = ?').run(newKey, envId);
    writeAudit(db, Number(existing.project_id), req.user, 'ROTATE_SDK_KEY', 'ENVIRONMENT', envId, `Rotated SDK key for ${existing.name}`);
    res.json({ id: envId, sdk_key: newKey });
  });

  // ==================== FEATURE FLAGS ====================
  app.get('/api/v1/flags', requireAuth, (req, res) => {
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    const environmentId = req.query.environmentId ? Number(req.query.environmentId) : null;
    const search = String(req.query.search || '').trim().toLowerCase();
    const typeFilter = req.query.type ? String(req.query.type) : null;
    const includeArchived = req.query.archived === 'true';
    const page = Math.max(1, Number(req.query.page || 1));
    const size = Math.min(100, Math.max(1, Number(req.query.size || 20)));

    let sql = `
      SELECT f.*, u.name as owner_name, p.key as project_key, p.name as project_name
      FROM feature_flags f
      JOIN users u ON u.id = f.owner_id
      JOIN projects p ON p.id = f.project_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    if (!includeArchived) {
      sql += ' AND f.archived = 0';
    }
    if (projectId) {
      if (!ensureProjectAccess(req.user!, projectId)) {
        return sendProblem(res, 403, 'forbidden', 'Project Access Denied', 'Cannot access this project.', req);
      }
      sql += ' AND f.project_id = ?';
      params.push(projectId);
    }
    if (typeFilter) {
      sql += ' AND f.type = ?';
      params.push(typeFilter);
    }
    if (search) {
      sql += ' AND (lower(f.key) LIKE ? OR lower(f.name) LIKE ? OR lower(f.description) LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY f.updated_at DESC, f.id DESC';

    const allRows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    const total = allRows.length;
    const sliced = allRows.slice((page - 1) * size, page * size);

    const items = sliced.map((f) => {
      const flagId = Number(f.id);
      const variations = db
        .prepare('SELECT id, key, name, value_json FROM flag_variations WHERE flag_id = ? ORDER BY sort_order ASC')
        .all(flagId)
        .map((v: Record<string, unknown>) => ({ ...v, value: JSON.parse(String(v.value_json)) }));

      const configs = db
        .prepare(
          `SELECT fc.*, e.key as env_key, e.name as env_name, e.require_approval
           FROM flag_configurations fc
           JOIN environments e ON e.id = fc.environment_id
           WHERE fc.flag_id = ? ${environmentId ? 'AND fc.environment_id = ?' : ''}
           ORDER BY e.sort_order ASC`,
        )
        .all(...(environmentId ? [flagId, environmentId] : [flagId]));

      return { ...f, variations, configurations: configs };
    });

    res.json({
      items,
      page,
      size,
      total,
      totalPages: Math.max(1, Math.ceil(total / size)),
    });
  });

  app.get('/api/v1/flags/:id', requireAuth, (req, res) => {
    const flagId = Number(req.params.id);
    const flag = db
      .prepare(
        `SELECT f.*, u.name as owner_name, p.key as project_key, p.name as project_name
         FROM feature_flags f
         JOIN users u ON u.id = f.owner_id
         JOIN projects p ON p.id = f.project_id
         WHERE f.id = ?`,
      )
      .get(flagId) as Record<string, unknown> | undefined;

    if (!flag) return sendProblem(res, 404, 'not-found', 'Flag Not Found', `Feature flag #${flagId} does not exist.`, req);
    if (!ensureProjectAccess(req.user!, Number(flag.project_id))) {
      return sendProblem(res, 403, 'forbidden', 'Project Access Denied', 'You do not have access to this project.', req);
    }

    const variations = db
      .prepare('SELECT id, key, name, value_json FROM flag_variations WHERE flag_id = ? ORDER BY sort_order ASC')
      .all(flagId)
      .map((v: Record<string, unknown>) => ({ ...v, value: JSON.parse(String(v.value_json)) }));

    const configurations = db
      .prepare(
        `SELECT fc.*, e.key as env_key, e.name as env_name, e.require_approval
         FROM flag_configurations fc JOIN environments e ON e.id = fc.environment_id
         WHERE fc.flag_id = ? ORDER BY e.sort_order ASC`,
      )
      .all(flagId)
      .map((cfg: Record<string, unknown>) => {
        const cfgId = Number(cfg.id);
        const rules = db
          .prepare('SELECT * FROM targeting_rules WHERE flag_configuration_id = ? ORDER BY priority ASC')
          .all(cfgId)
          .map((r: Record<string, unknown>) => ({ ...r, rootRule: JSON.parse(String(r.root_rule_json)) }));
        const targets = db
          .prepare('SELECT * FROM flag_targets WHERE flag_configuration_id = ? ORDER BY id ASC')
          .all(cfgId);
        return {
          ...cfg,
          rolloutAllocations: cfg.rollout_allocations_json ? JSON.parse(String(cfg.rollout_allocations_json)) : null,
          rules,
          targets,
        };
      });

    res.json({ ...flag, variations, configurations });
  });

  app.post('/api/v1/flags', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const {
      projectId,
      key,
      name,
      description,
      type,
      variations,
      defaultVariationKey,
      offVariationKey,
      experimentActive,
      experimentId,
      conversionEventName,
    } = req.body || {};

    if (!projectId || !key || !name || !['BOOLEAN', 'STRING', 'NUMBER', 'JSON'].includes(type)) {
      return sendProblem(res, 400, 'validation-error', 'Invalid Flag Payload', 'projectId, key, name, and valid type are required.', req);
    }
    if (!/^[a-z0-9-]+$/.test(String(key))) {
      return sendProblem(res, 400, 'validation-error', 'Invalid Flag Key', 'Key must contain lowercase letters, numbers, and hyphens only.', req);
    }
    if (!ensureProjectAccess(req.user!, Number(projectId))) {
      return sendProblem(res, 403, 'forbidden', 'Project Access Denied', 'Cannot create flags in this project.', req);
    }
    const existing = db.prepare('SELECT id FROM feature_flags WHERE project_id = ? AND key = ?').get(Number(projectId), key);
    if (existing) {
      return sendProblem(res, 409, 'duplicate-flag', 'Duplicate Flag Key', `Flag '${key}' already exists in this project.`, req);
    }

    const varList: Array<{ key: string; name: string; value: unknown }> =
      Array.isArray(variations) && variations.length >= 2
        ? variations
        : type === 'BOOLEAN'
          ? [
              { key: 'on', name: 'Enabled', value: true },
              { key: 'off', name: 'Disabled', value: false },
            ]
          : type === 'NUMBER'
            ? [
                { key: 'v1', name: 'Baseline (10)', value: 10 },
                { key: 'v2', name: 'Treatment (50)', value: 50 },
              ]
            : type === 'JSON'
              ? [
                  { key: 'default', name: 'Default Config', value: { enabled: false } },
                  { key: 'variant', name: 'Variant Config', value: { enabled: true } },
                ]
              : [
                  { key: 'control', name: 'Control', value: 'control' },
                  { key: 'treatment', name: 'Treatment', value: 'treatment' },
                ];

    // Validate variation value types
    for (const v of varList) {
      if (type === 'BOOLEAN' && typeof v.value !== 'boolean') {
        return sendProblem(res, 400, 'type-mismatch', 'Variation Type Mismatch', 'BOOLEAN flag variations must be booleans.', req);
      }
      if (type === 'NUMBER' && typeof v.value !== 'number') {
        return sendProblem(res, 400, 'type-mismatch', 'Variation Type Mismatch', 'NUMBER flag variations must be numbers.', req);
      }
      if (type === 'STRING' && typeof v.value !== 'string') {
        return sendProblem(res, 400, 'type-mismatch', 'Variation Type Mismatch', 'STRING flag variations must be strings.', req);
      }
      if (type === 'JSON' && (typeof v.value !== 'object' || v.value === null)) {
        return sendProblem(res, 400, 'type-mismatch', 'Variation Type Mismatch', 'JSON flag variations must be JSON objects.', req);
      }
    }

    const defVar = defaultVariationKey || varList[varList.length - 1].key;
    const offVar = offVariationKey || varList[varList.length - 1].key;

    const flagId = Number(
      db
        .prepare(
          `INSERT INTO feature_flags (
            project_id, key, name, description, type, owner_id,
            default_variation_key, off_variation_key, experiment_active,
            experiment_id, conversion_event_name, last_evaluated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .run(
          Number(projectId),
          key,
          String(name).trim(),
          String(description || ''),
          type,
          req.user!.id,
          defVar,
          offVar,
          experimentActive ? 1 : 0,
          experimentId || null,
          conversionEventName || null,
        ).lastInsertRowid,
    );

    const insVar = db.prepare('INSERT INTO flag_variations (flag_id, key, name, value_json, sort_order) VALUES (?, ?, ?, ?, ?)');
    varList.forEach((v, idx) => insVar.run(flagId, v.key, v.name, JSON.stringify(v.value), idx + 1));

    const envs = db.prepare('SELECT id FROM environments WHERE project_id = ?').all(Number(projectId)) as Array<{ id: number }>;
    const insCfg = db.prepare(
      `INSERT INTO flag_configurations (
        flag_id, environment_id, enabled, kill_switch_active,
        default_variation_key, off_variation_key, rollout_percentage, rollout_variation_key
      ) VALUES (?, ?, 0, 0, ?, ?, 0, ?)`,
    );
    const insVer = db.prepare(
      'INSERT INTO flag_versions (flag_id, environment_id, version, snapshot_json, author_id, reason) VALUES (?, ?, 1, ?, ?, ?)',
    );
    for (const env of envs) {
      insCfg.run(flagId, env.id, defVar, offVar, varList[0].key);
      insVer.run(
        flagId,
        env.id,
        JSON.stringify({ enabled: false, killSwitchActive: false, rolloutPercentage: 0 }),
        req.user!.id,
        'Initial flag creation',
      );
      bus.publishEnvUpdate(env.id, { flagId, flagKey: key, version: 1 });
    }

    writeAudit(db, Number(projectId), req.user, 'CREATE_FLAG', 'FEATURE_FLAG', key, `Created ${type} flag ${key}`);
    res.status(201).json(db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(flagId));
  });

  app.patch('/api/v1/flags/:id', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const flagId = Number(req.params.id);
    const flag = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(flagId) as Record<string, unknown> | undefined;
    if (!flag) return sendProblem(res, 404, 'not-found', 'Flag Not Found', 'Flag does not exist.', req);
    const { name, description, experimentActive, experimentId, conversionEventName } = req.body || {};
    db.prepare(
      `UPDATE feature_flags
       SET name = ?, description = ?, experiment_active = ?, experiment_id = ?, conversion_event_name = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      String(name ?? flag.name),
      String(description ?? flag.description),
      experimentActive !== undefined ? (experimentActive ? 1 : 0) : Number(flag.experiment_active),
      experimentId !== undefined ? (experimentId ? String(experimentId) : null) : (flag.experiment_id as string | null),
      conversionEventName !== undefined ? (conversionEventName ? String(conversionEventName) : null) : (flag.conversion_event_name as string | null),
      flagId,
    );
    writeAudit(db, Number(flag.project_id), req.user, 'UPDATE_FLAG', 'FEATURE_FLAG', String(flag.key), `Updated metadata for ${flag.key}`);
    res.json(db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(flagId));
  });

  app.post('/api/v1/flags/:id/archive', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const flagId = Number(req.params.id);
    const flag = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(flagId) as Record<string, unknown> | undefined;
    if (!flag) return sendProblem(res, 404, 'not-found', 'Flag Not Found', 'Flag does not exist.', req);
    const archived = req.body?.archived !== undefined ? (req.body.archived ? 1 : 0) : 1;
    db.prepare("UPDATE feature_flags SET archived = ?, updated_at = datetime('now') WHERE id = ?").run(archived, flagId);

    const envs = db.prepare('SELECT id FROM environments WHERE project_id = ?').all(Number(flag.project_id)) as Array<{ id: number }>;
    for (const e of envs) bus.publishEnvUpdate(e.id, { flagId, flagKey: flag.key, archived: Boolean(archived) });

    writeAudit(
      db,
      Number(flag.project_id),
      req.user,
      archived ? 'ARCHIVE_FLAG' : 'RESTORE_FLAG',
      'FEATURE_FLAG',
      String(flag.key),
      `${archived ? 'Archived' : 'Restored'} flag ${flag.key}`,
    );
    res.json({ id: flagId, archived: Boolean(archived) });
  });

  app.post('/api/v1/flags/:id/toggle-kill-switch', requireAuth, requireMinRole('APPROVER'), (req, res) => {
    const flagId = Number(req.params.id);
    const { environmentId, killSwitchActive, reason } = req.body || {};
    if (!environmentId) {
      return sendProblem(res, 400, 'validation-error', 'Environment Required', 'environmentId is required.', req);
    }
    const flag = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(flagId) as Record<string, unknown> | undefined;
    if (!flag) return sendProblem(res, 404, 'not-found', 'Flag Not Found', 'Flag does not exist.', req);

    const result = applyConfigUpdate(
      db,
      bus,
      flagId,
      Number(environmentId),
      { killSwitchActive: Boolean(killSwitchActive) },
      req.user!.id,
      reason || (killSwitchActive ? 'Emergency kill switch activated' : 'Kill switch cleared'),
    );

    writeAudit(
      db,
      Number(flag.project_id),
      req.user,
      killSwitchActive ? 'ACTIVATE_KILL_SWITCH' : 'CLEAR_KILL_SWITCH',
      'FEATURE_FLAG',
      String(flag.key),
      `${killSwitchActive ? 'Activated' : 'Cleared'} kill switch on ${flag.key}`,
      { killSwitchActive: Boolean(killSwitchActive) },
    );
    res.json(result);
  });

  app.post('/api/v1/flags/:id/evaluate-preview', requireAuth, (req, res) => {
    const flagId = Number(req.params.id);
    const { environmentId, userKey, attributes } = req.body || {};
    if (!environmentId || !userKey) {
      return sendProblem(res, 400, 'validation-error', 'Validation Error', 'environmentId and userKey are required.', req);
    }
    const flag = db.prepare('SELECT key FROM feature_flags WHERE id = ?').get(flagId) as { key: string } | undefined;
    if (!flag) return sendProblem(res, 404, 'not-found', 'Flag Not Found', 'Flag does not exist.', req);

    const snapshot = buildEnvironmentSnapshot(db, Number(environmentId));
    if (!snapshot || !snapshot.flags[flag.key]) {
      return sendProblem(res, 404, 'not-found', 'Config Not Found', 'Environment configuration not found.', req);
    }
    const segMap = new Map(Object.entries(snapshot.segments));
    const t0 = performance.now();
    const result = evaluateFlag(snapshot.flags[flag.key], { userKey: String(userKey), attributes: attributes || {} }, segMap);
    const elapsedMicros = Math.round((performance.now() - t0) * 1000);
    res.json({ ...result, evaluatedAtMicros: elapsedMicros });
  });

  // ==================== SEGMENTS ====================
  app.get('/api/v1/segments', requireAuth, (req, res) => {
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    const rows = projectId
      ? db.prepare('SELECT * FROM user_segments WHERE project_id = ? ORDER BY id ASC').all(projectId)
      : db.prepare('SELECT * FROM user_segments ORDER BY id ASC').all();
    res.json({
      items: (rows as Array<Record<string, unknown>>).map((r) => ({
        ...r,
        rootRule: JSON.parse(String(r.root_rule_json)),
      })),
    });
  });

  app.post('/api/v1/segments', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const { projectId, key, name, description, rootRule } = req.body || {};
    if (!projectId || !key || !name || !rootRule) {
      return sendProblem(res, 400, 'validation-error', 'Validation Error', 'projectId, key, name, and rootRule are required.', req);
    }
    const existing = db.prepare('SELECT id FROM user_segments WHERE project_id = ? AND key = ?').get(Number(projectId), key);
    if (existing) {
      return sendProblem(res, 409, 'duplicate-segment', 'Duplicate Segment', `Segment '${key}' already exists.`, req);
    }
    const segId = Number(
      db
        .prepare('INSERT INTO user_segments (project_id, key, name, description, root_rule_json) VALUES (?, ?, ?, ?, ?)')
        .run(Number(projectId), key, name, description || '', JSON.stringify(rootRule)).lastInsertRowid,
    );

    const envs = db.prepare('SELECT id FROM environments WHERE project_id = ?').all(Number(projectId)) as Array<{ id: number }>;
    for (const e of envs) bus.publishEnvUpdate(e.id, { segmentKey: key });

    writeAudit(db, Number(projectId), req.user, 'CREATE_SEGMENT', 'USER_SEGMENT', key, `Created segment ${name}`);
    res.status(201).json({ id: segId, projectId, key, name, description, rootRule });
  });

  app.patch('/api/v1/segments/:id', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const segId = Number(req.params.id);
    const seg = db.prepare('SELECT * FROM user_segments WHERE id = ?').get(segId) as Record<string, unknown> | undefined;
    if (!seg) return sendProblem(res, 404, 'not-found', 'Segment Not Found', 'Segment not found.', req);
    const { name, description, rootRule } = req.body || {};
    db.prepare("UPDATE user_segments SET name = ?, description = ?, root_rule_json = ?, updated_at = datetime('now') WHERE id = ?").run(
      String(name ?? seg.name),
      String(description ?? seg.description),
      rootRule ? JSON.stringify(rootRule) : String(seg.root_rule_json),
      segId,
    );
    const envs = db.prepare('SELECT id FROM environments WHERE project_id = ?').all(Number(seg.project_id)) as Array<{ id: number }>;
    for (const e of envs) bus.publishEnvUpdate(e.id, { segmentKey: seg.key });

    writeAudit(db, Number(seg.project_id), req.user, 'UPDATE_SEGMENT', 'USER_SEGMENT', String(seg.key), `Updated segment ${seg.name}`);
    res.json({ id: segId, name: name ?? seg.name, rootRule: rootRule ?? JSON.parse(String(seg.root_rule_json)) });
  });

  app.delete('/api/v1/segments/:id', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const segId = Number(req.params.id);
    const seg = db.prepare('SELECT * FROM user_segments WHERE id = ?').get(segId) as Record<string, unknown> | undefined;
    if (!seg) return sendProblem(res, 404, 'not-found', 'Segment Not Found', 'Segment not found.', req);
    db.prepare('DELETE FROM user_segments WHERE id = ?').run(segId);
    writeAudit(db, Number(seg.project_id), req.user, 'DELETE_SEGMENT', 'USER_SEGMENT', String(seg.key), `Deleted segment ${seg.name}`);
    res.status(204).end();
  });

  // ==================== TARGETING & ROLLOUTS & APPROVALS ====================
  app.put('/api/v1/targeting/config/:flagId/:envId', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const flagId = Number(req.params.flagId);
    const envId = Number(req.params.envId);
    const {
      enabled,
      killSwitchActive,
      defaultVariationKey,
      offVariationKey,
      rolloutPercentage,
      rolloutVariationKey,
      rolloutAllocations,
      reason,
      submitAsChangeRequest,
    } = req.body || {};

    const flag = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(flagId) as Record<string, unknown> | undefined;
    const env = db.prepare('SELECT * FROM environments WHERE id = ?').get(envId) as Record<string, unknown> | undefined;
    if (!flag || !env) return sendProblem(res, 404, 'not-found', 'Not Found', 'Flag or environment not found.', req);

    const before = getConfigSnapshot(db, flagId, envId);
    const afterPatch = {
      enabled,
      killSwitchActive,
      defaultVariationKey,
      offVariationKey,
      rolloutPercentage,
      rolloutVariationKey,
      rolloutAllocations,
    };

    // Production Approval Enforcement (FR7)
    if (Boolean(env.require_approval) || submitAsChangeRequest) {
      const afterSnapshot = {
        ...before,
        ...Object.fromEntries(Object.entries(afterPatch).filter(([, v]) => v !== undefined)),
      };
      const crId = Number(
        db
          .prepare(
            `INSERT INTO change_requests (
              flag_id, environment_id, author_id, status, title, reason,
              before_snapshot_json, after_snapshot_json
            ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
          )
          .run(
            flagId,
            envId,
            req.user!.id,
            `Update ${flag.key} in ${env.name}`,
            reason || 'Configuration change submitted for peer approval.',
            JSON.stringify(before),
            JSON.stringify(afterSnapshot),
          ).lastInsertRowid,
      );
      writeAudit(
        db,
        Number(flag.project_id),
        req.user,
        'SUBMIT_CHANGE_REQUEST',
        'CHANGE_REQUEST',
        crId,
        `Submitted change request #${crId} for ${flag.key} in ${env.name}`,
        { before, after: afterSnapshot },
      );
      return res.status(202).json({
        status: 'PENDING_APPROVAL',
        changeRequestId: crId,
        message: 'Environment requires peer approval before changes take effect.',
      });
    }

    const updated = applyConfigUpdate(
      db,
      bus,
      flagId,
      envId,
      afterPatch,
      req.user!.id,
      reason || 'Direct configuration update',
    );
    writeAudit(
      db,
      Number(flag.project_id),
      req.user,
      'UPDATE_FLAG_CONFIG',
      'FEATURE_FLAG',
      String(flag.key),
      `Updated ${flag.key} in ${env.name}`,
      { before, after: updated.snapshot },
    );
    res.json({ status: 'APPLIED', ...updated });
  });

  app.post('/api/v1/targeting/targets', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const { flagConfigurationId, userKey, variationKey } = req.body || {};
    if (!flagConfigurationId || !userKey || !variationKey) {
      return sendProblem(res, 400, 'validation-error', 'Validation Error', 'flagConfigurationId, userKey, and variationKey are required.', req);
    }
    const cfg = db.prepare('SELECT * FROM flag_configurations WHERE id = ?').get(Number(flagConfigurationId)) as Record<string, unknown> | undefined;
    if (!cfg) return sendProblem(res, 404, 'not-found', 'Config Not Found', 'Flag configuration not found.', req);

    db.prepare(
      `INSERT INTO flag_targets (flag_configuration_id, user_key, variation_key) VALUES (?, ?, ?)
       ON CONFLICT(flag_configuration_id, user_key) DO UPDATE SET variation_key = excluded.variation_key`,
    ).run(Number(flagConfigurationId), String(userKey).trim(), String(variationKey));

    bus.publishEnvUpdate(Number(cfg.environment_id), { flagId: cfg.flag_id });
    res.status(201).json({ flagConfigurationId, userKey, variationKey });
  });

  app.delete('/api/v1/targeting/targets/:id', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const id = Number(req.params.id);
    const target = db
      .prepare(
        `SELECT ft.id, fc.environment_id, fc.flag_id FROM flag_targets ft
         JOIN flag_configurations fc ON fc.id = ft.flag_configuration_id WHERE ft.id = ?`,
      )
      .get(id) as { id: number; environment_id: number; flag_id: number } | undefined;
    if (!target) return sendProblem(res, 404, 'not-found', 'Target Not Found', 'Target not found.', req);
    db.prepare('DELETE FROM flag_targets WHERE id = ?').run(id);
    bus.publishEnvUpdate(target.environment_id, { flagId: target.flag_id });
    res.status(204).end();
  });

  app.post('/api/v1/targeting/rules', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const { flagConfigurationId, name, priority, variationKey, rootRule } = req.body || {};
    if (!flagConfigurationId || !name || !variationKey || !rootRule) {
      return sendProblem(res, 400, 'validation-error', 'Validation Error', 'flagConfigurationId, name, variationKey, and rootRule are required.', req);
    }
    const cfg = db.prepare('SELECT * FROM flag_configurations WHERE id = ?').get(Number(flagConfigurationId)) as Record<string, unknown> | undefined;
    if (!cfg) return sendProblem(res, 404, 'not-found', 'Config Not Found', 'Flag configuration not found.', req);
    const id = Number(
      db
        .prepare('INSERT INTO targeting_rules (flag_configuration_id, name, priority, variation_key, root_rule_json) VALUES (?, ?, ?, ?, ?)')
        .run(Number(flagConfigurationId), name, Number(priority || 1), variationKey, JSON.stringify(rootRule)).lastInsertRowid,
    );
    bus.publishEnvUpdate(Number(cfg.environment_id), { flagId: cfg.flag_id });
    res.status(201).json({ id, flagConfigurationId, name, priority: Number(priority || 1), variationKey, rootRule });
  });

  app.delete('/api/v1/targeting/rules/:id', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const id = Number(req.params.id);
    const rule = db
      .prepare(
        `SELECT tr.id, fc.environment_id, fc.flag_id FROM targeting_rules tr
         JOIN flag_configurations fc ON fc.id = tr.flag_configuration_id WHERE tr.id = ?`,
      )
      .get(id) as { id: number; environment_id: number; flag_id: number } | undefined;
    if (!rule) return sendProblem(res, 404, 'not-found', 'Rule Not Found', 'Rule not found.', req);
    db.prepare('DELETE FROM targeting_rules WHERE id = ?').run(id);
    bus.publishEnvUpdate(rule.environment_id, { flagId: rule.flag_id });
    res.status(204).end();
  });

  // ==================== SCHEDULED ROLLOUTS ====================
  app.get('/api/v1/rollouts/schedules', requireAuth, (_req, res) => {
    const items = db
      .prepare(
        `SELECT sc.*, f.key as flag_key, f.name as flag_name, e.name as env_name, u.name as author_name
         FROM scheduled_changes sc
         JOIN feature_flags f ON f.id = sc.flag_id
         JOIN environments e ON e.id = sc.environment_id
         JOIN users u ON u.id = sc.author_id
         ORDER BY sc.scheduled_for ASC`,
      )
      .all()
      .map((r: Record<string, unknown>) => ({ ...r, payload: JSON.parse(String(r.payload_json)) }));
    res.json({ items });
  });

  app.post('/api/v1/rollouts/schedules', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const { flagId, environmentId, scheduledFor, payload, reason } = req.body || {};
    if (!flagId || !environmentId || !scheduledFor || !payload) {
      return sendProblem(res, 400, 'validation-error', 'Validation Error', 'flagId, environmentId, scheduledFor, and payload are required.', req);
    }
    const id = Number(
      db
        .prepare(
          `INSERT INTO scheduled_changes (flag_id, environment_id, author_id, scheduled_for, payload_json, status, reason)
           VALUES (?, ?, ?, ?, ?, 'SCHEDULED', ?)`,
        )
        .run(Number(flagId), Number(environmentId), req.user!.id, String(scheduledFor), JSON.stringify(payload), reason || '').lastInsertRowid,
    );
    writeAudit(db, null, req.user, 'SCHEDULE_ROLLOUT', 'SCHEDULED_CHANGE', id, `Scheduled change #${id} for ${scheduledFor}`);
    res.status(201).json({ id, status: 'SCHEDULED' });
  });

  app.delete('/api/v1/rollouts/schedules/:id', requireAuth, requireMinRole('EDITOR'), (req, res) => {
    const id = Number(req.params.id);
    db.prepare("UPDATE scheduled_changes SET status = 'CANCELLED' WHERE id = ? AND status = 'SCHEDULED'").run(id);
    res.json({ id, status: 'CANCELLED' });
  });

  // ==================== APPROVAL WORKFLOW ====================
  app.get('/api/v1/approvals', requireAuth, (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    let sql = `
      SELECT cr.*, f.key as flag_key, f.name as flag_name, f.project_id,
             p.name as project_name, e.key as env_key, e.name as env_name,
             u.name as author_name, u.email as author_email
      FROM change_requests cr
      JOIN feature_flags f ON f.id = cr.flag_id
      JOIN projects p ON p.id = f.project_id
      JOIN environments e ON e.id = cr.environment_id
      JOIN users u ON u.id = cr.author_id
      WHERE 1=1
    `;
    const params: string[] = [];
    if (status) {
      sql += ' AND cr.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY cr.created_at DESC, cr.id DESC';
    const items = (db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map((cr) => {
      const approval = db
        .prepare(
          `SELECT a.*, u.name as approver_name, u.email as approver_email
           FROM approvals a JOIN users u ON u.id = a.approver_id
           WHERE a.change_request_id = ?`,
        )
        .get(Number(cr.id));
      return {
        ...cr,
        beforeSnapshot: JSON.parse(String(cr.before_snapshot_json)),
        afterSnapshot: JSON.parse(String(cr.after_snapshot_json)),
        approval: approval || null,
      };
    });
    res.json({ items });
  });

  app.post('/api/v1/approvals/:id/approve', requireAuth, requireMinRole('APPROVER'), (req, res) => {
    const crId = Number(req.params.id);
    const cr = db.prepare('SELECT * FROM change_requests WHERE id = ?').get(crId) as Record<string, unknown> | undefined;
    if (!cr) return sendProblem(res, 404, 'not-found', 'Change Request Not Found', 'Change request not found.', req);
    if (cr.status !== 'PENDING') {
      return sendProblem(res, 409, 'already-resolved', 'Already Resolved', `Change request is already ${cr.status}.`, req);
    }
    // Critical FR7 rule: prevent users from approving their own production changes!
    if (Number(cr.author_id) === req.user!.id) {
      return sendProblem(
        res,
        403,
        'self-approval-forbidden',
        'Self-Approval Forbidden',
        'Authors cannot approve their own production change requests. A second peer approver is required.',
        req,
      );
    }

    const after = JSON.parse(String(cr.after_snapshot_json));
    const flag = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(Number(cr.flag_id)) as Record<string, unknown>;

    const applied = applyConfigUpdate(
      db,
      bus,
      Number(cr.flag_id),
      Number(cr.environment_id),
      after,
      Number(cr.author_id),
      `Approved CR #${crId}: ${cr.reason}`,
    );

    db.prepare("UPDATE change_requests SET status = 'APPROVED', resolved_at = datetime('now') WHERE id = ?").run(crId);
    db.prepare("INSERT INTO approvals (change_request_id, approver_id, decision, comment) VALUES (?, ?, 'APPROVED', ?)").run(
      crId,
      req.user!.id,
      req.body?.comment || 'Approved for production release',
    );

    writeAudit(
      db,
      Number(flag.project_id),
      req.user,
      'APPROVE_CHANGE_REQUEST',
      'CHANGE_REQUEST',
      crId,
      `Approved change request #${crId} for ${flag.key}`,
      { before: JSON.parse(String(cr.before_snapshot_json)), after },
    );
    res.json({ id: crId, status: 'APPROVED', appliedVersion: applied.version });
  });

  app.post('/api/v1/approvals/:id/reject', requireAuth, requireMinRole('APPROVER'), (req, res) => {
    const crId = Number(req.params.id);
    const cr = db.prepare('SELECT * FROM change_requests WHERE id = ?').get(crId) as Record<string, unknown> | undefined;
    if (!cr) return sendProblem(res, 404, 'not-found', 'Change Request Not Found', 'Change request not found.', req);
    if (cr.status !== 'PENDING') {
      return sendProblem(res, 409, 'already-resolved', 'Already Resolved', `Change request is already ${cr.status}.`, req);
    }
    db.prepare("UPDATE change_requests SET status = 'REJECTED', resolved_at = datetime('now') WHERE id = ?").run(crId);
    db.prepare("INSERT INTO approvals (change_request_id, approver_id, decision, comment) VALUES (?, ?, 'REJECTED', ?)").run(
      crId,
      req.user!.id,
      req.body?.comment || 'Rejected during peer review',
    );
    writeAudit(db, null, req.user, 'REJECT_CHANGE_REQUEST', 'CHANGE_REQUEST', crId, `Rejected change request #${crId}`);
    res.json({ id: crId, status: 'REJECTED' });
  });

  // ==================== VERSIONS & ROLLBACK (COMMAND PATTERN) ====================
  app.get('/api/v1/versions', requireAuth, (req, res) => {
    const flagId = req.query.flagId ? Number(req.query.flagId) : null;
    let sql = `
      SELECT fv.*, f.key as flag_key, f.name as flag_name, e.key as env_key, e.name as env_name, u.name as author_name
      FROM flag_versions fv
      JOIN feature_flags f ON f.id = fv.flag_id
      JOIN environments e ON e.id = fv.environment_id
      JOIN users u ON u.id = fv.author_id
      WHERE 1=1
    `;
    const params: number[] = [];
    if (flagId) {
      sql += ' AND fv.flag_id = ?';
      params.push(flagId);
    }
    sql += ' ORDER BY fv.created_at DESC, fv.id DESC LIMIT 100';
    const items = (db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map((v) => ({
      ...v,
      snapshot: JSON.parse(String(v.snapshot_json)),
    }));
    res.json({ items });
  });

  app.post('/api/v1/versions/:versionId/rollback', requireAuth, requireMinRole('APPROVER'), (req, res) => {
    const versionId = Number(req.params.versionId);
    const ver = db.prepare('SELECT * FROM flag_versions WHERE id = ?').get(versionId) as Record<string, unknown> | undefined;
    if (!ver) return sendProblem(res, 404, 'not-found', 'Version Not Found', 'Target version snapshot not found.', req);
    const snapshot = JSON.parse(String(ver.snapshot_json));
    const flag = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(Number(ver.flag_id)) as Record<string, unknown>;

    const result = applyConfigUpdate(
      db,
      bus,
      Number(ver.flag_id),
      Number(ver.environment_id),
      snapshot,
      req.user!.id,
      `Rollback to v${ver.version}: ${req.body?.reason || 'Operator initiated rollback'}`,
    );
    writeAudit(
      db,
      Number(flag.project_id),
      req.user,
      'ROLLBACK_FLAG',
      'FEATURE_FLAG',
      String(flag.key),
      `Rolled back ${flag.key} to version v${ver.version}`,
      snapshot,
    );
    res.json({ status: 'ROLLED_BACK', newVersion: result.version, restoredFromVersion: ver.version });
  });

  // ==================== SDK & LIVE SSE STREAM ====================
  const resolveEnvBySdkKeyOrParam = (req: Request): Record<string, unknown> | null => {
    const sdkKey = (req.headers['x-flagship-sdk-key'] as string) || (req.query.sdkKey as string);
    if (sdkKey) {
      return (db.prepare('SELECT * FROM environments WHERE sdk_key = ?').get(sdkKey) as Record<string, unknown>) || null;
    }
    if (req.query.environmentId) {
      return (
        (db.prepare('SELECT * FROM environments WHERE id = ?').get(Number(req.query.environmentId)) as Record<
          string,
          unknown
        >) || null
      );
    }
    return null;
  };

  app.get('/api/v1/sdk/snapshot', (req, res) => {
    const env = resolveEnvBySdkKeyOrParam(req);
    if (!env) {
      return sendProblem(res, 401, 'invalid-sdk-key', 'Invalid SDK Key', 'Provide a valid X-FlagShip-SDK-Key header.', req);
    }
    const snapshot = buildEnvironmentSnapshot(db, Number(env.id));
    res.json(snapshot);
  });

  app.get('/api/v1/sdk/stream', (req, res) => {
    const env = resolveEnvBySdkKeyOrParam(req);
    if (!env) {
      return sendProblem(res, 401, 'invalid-sdk-key', 'Invalid SDK Key', 'Provide a valid sdkKey query or X-FlagShip-SDK-Key header.', req);
    }
    const envId = Number(env.id);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const snapshot = buildEnvironmentSnapshot(db, envId);
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

    bus.subscribeEnv(envId, res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      bus.unsubscribeEnv(envId, res);
    });
  });

  app.get('/api/v1/sdk/dashboard-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);

    bus.subscribeDashboard(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      bus.unsubscribeDashboard(res);
    });
  });

  app.post('/api/v1/sdk/heartbeat', (req, res) => {
    const env = resolveEnvBySdkKeyOrParam(req);
    if (!env) {
      return sendProblem(res, 401, 'invalid-sdk-key', 'Invalid SDK Key', 'Valid SDK key required.', req);
    }
    const { instanceId, appName, sdkVersion, transport, lastSyncLatencyMs } = req.body || {};
    if (!instanceId || !appName) {
      return sendProblem(res, 400, 'validation-error', 'Validation Error', 'instanceId and appName are required.', req);
    }
    db.prepare(
      `INSERT INTO sdk_instances (instance_id, environment_id, app_name, sdk_version, transport, status, last_sync_latency_ms, last_heartbeat_at)
       VALUES (?, ?, ?, ?, ?, 'CONNECTED', ?, datetime('now'))
       ON CONFLICT(instance_id) DO UPDATE SET
         status = 'CONNECTED',
         transport = excluded.transport,
         last_sync_latency_ms = excluded.last_sync_latency_ms,
         last_heartbeat_at = datetime('now')`,
    ).run(
      String(instanceId),
      Number(env.id),
      String(appName),
      String(sdkVersion || '1.0.0'),
      transport === 'POLLING' ? 'POLLING' : 'SSE',
      Number(lastSyncLatencyMs || 0),
    );
    res.json({ status: 'OK', serverTime: new Date().toISOString() });
  });

  app.get('/api/v1/sdk/instances', requireAuth, (_req, res) => {
    const items = db
      .prepare(
        `SELECT si.*, e.key as env_key, e.name as env_name, p.name as project_name
         FROM sdk_instances si
         JOIN environments e ON e.id = si.environment_id
         JOIN projects p ON p.id = e.project_id
         ORDER BY si.last_heartbeat_at DESC`,
      )
      .all();
    res.json({ items });
  });

  // ==================== BATCH EVENTS & EXPERIMENT ANALYTICS ====================
  app.post('/api/v1/events/batch', (req, res) => {
    const env = resolveEnvBySdkKeyOrParam(req);
    if (!env) {
      return sendProblem(res, 401, 'invalid-sdk-key', 'Invalid SDK Key', 'Valid SDK key required.', req);
    }
    const { exposures = [], conversions = [] } = req.body || {};
    const insExp = db.prepare(
      `INSERT INTO exposure_events (project_id, environment_id, flag_key, experiment_id, user_key, variation_key, reason, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insConv = db.prepare(
      `INSERT INTO conversion_events (project_id, environment_id, flag_key, experiment_id, event_name, user_key, variation_key, value, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const updateLastEval = db.prepare('UPDATE feature_flags SET last_evaluated_at = ? WHERE project_id = ? AND key = ?');
    const nowIso = new Date().toISOString();

    for (const e of exposures) {
      insExp.run(
        Number(env.project_id),
        Number(env.id),
        String(e.flagKey),
        e.experimentId || null,
        String(e.userKey),
        String(e.variationKey),
        String(e.reason || 'PERCENTAGE_ROLLOUT'),
        e.occurredAt || nowIso,
      );
      updateLastEval.run(nowIso, Number(env.project_id), String(e.flagKey));
    }

    for (const c of conversions) {
      insConv.run(
        Number(env.project_id),
        Number(env.id),
        String(c.flagKey),
        c.experimentId || null,
        String(c.eventName || 'conversion'),
        String(c.userKey),
        String(c.variationKey),
        Number(c.value ?? 1),
        c.occurredAt || nowIso,
      );
    }

    res.status(202).json({ acceptedExposures: exposures.length, acceptedConversions: conversions.length });
  });

  app.get('/api/v1/experiments', requireAuth, (_req, res) => {
    const flags = db
      .prepare(
        `SELECT f.*, p.name as project_name, p.key as project_key
         FROM feature_flags f JOIN projects p ON p.id = f.project_id
         WHERE f.experiment_active = 1 AND f.archived = 0`,
      )
      .all() as Array<Record<string, unknown>>;

    const items = flags.map((f) => {
      const expCounts = db
        .prepare(
          `SELECT variation_key, COUNT(*) as exposures
           FROM exposure_events WHERE project_id = ? AND flag_key = ?
           GROUP BY variation_key`,
        )
        .all(Number(f.project_id), String(f.key)) as Array<{ variation_key: string; exposures: number }>;

      const convCounts = db
        .prepare(
          `SELECT variation_key, COUNT(*) as conversions
           FROM conversion_events WHERE project_id = ? AND flag_key = ?
           GROUP BY variation_key`,
        )
        .all(Number(f.project_id), String(f.key)) as Array<{ variation_key: string; conversions: number }>;

      const totalExposures = expCounts.reduce((acc, r) => acc + r.exposures, 0);
      const totalConversions = convCounts.reduce((acc, r) => acc + r.conversions, 0);

      return {
        ...f,
        totalExposures,
        totalConversions,
        conversionRate: totalExposures > 0 ? Number(((totalConversions / totalExposures) * 100).toFixed(2)) : 0,
      };
    });
    res.json({ items });
  });

  app.get('/api/v1/analytics/experiments/:flagKey', requireAuth, (req, res) => {
    const flagKey = req.params.flagKey;
    const flag = db
      .prepare('SELECT * FROM feature_flags WHERE key = ?')
      .get(flagKey) as Record<string, unknown> | undefined;
    if (!flag) return sendProblem(res, 404, 'not-found', 'Flag Not Found', 'Experiment flag not found.', req);

    const vars = db
      .prepare('SELECT key, name FROM flag_variations WHERE flag_id = ? ORDER BY sort_order ASC')
      .all(Number(flag.id)) as Array<{ key: string; name: string }>;

    const prodEnv = db
      .prepare("SELECT id FROM environments WHERE project_id = ? AND key = 'production'")
      .get(Number(flag.project_id)) as { id: number } | undefined;

    const cfg = prodEnv
      ? (db
          .prepare('SELECT rollout_percentage, rollout_allocations_json FROM flag_configurations WHERE flag_id = ? AND environment_id = ?')
          .get(Number(flag.id), prodEnv.id) as { rollout_percentage: number; rollout_allocations_json: string | null } | undefined)
      : undefined;

    const allocs: Array<{ variationKey: string; weight: number }> = cfg?.rollout_allocations_json
      ? JSON.parse(cfg.rollout_allocations_json)
      : vars.length === 2
        ? [
            { variationKey: vars[0].key, weight: cfg?.rollout_percentage ?? 50 },
            { variationKey: vars[1].key, weight: 100 - (cfg?.rollout_percentage ?? 50) },
          ]
        : vars.map((v) => ({ variationKey: v.key, weight: 100 / Math.max(1, vars.length) }));

    const expByVar = new Map<string, number>();
    const convByVar = new Map<string, number>();

    for (const r of db
      .prepare('SELECT variation_key, COUNT(*) as c FROM exposure_events WHERE flag_key = ? GROUP BY variation_key')
      .all(flagKey) as Array<{ variation_key: string; c: number }>) {
      expByVar.set(r.variation_key, r.c);
    }
    for (const r of db
      .prepare('SELECT variation_key, COUNT(*) as c FROM conversion_events WHERE flag_key = ? GROUP BY variation_key')
      .all(flagKey) as Array<{ variation_key: string; c: number }>) {
      convByVar.set(r.variation_key, r.c);
    }

    const variations = vars.map((v) => {
      const exposures = expByVar.get(v.key) || 0;
      const conversions = convByVar.get(v.key) || 0;
      const expectedWeight = allocs.find((a) => a.variationKey === v.key)?.weight ?? 0;
      return {
        key: v.key,
        name: v.name,
        exposures,
        conversions,
        conversionRate: exposures > 0 ? Number(((conversions / exposures) * 100).toFixed(2)) : 0,
        expectedWeight,
      };
    });

    const srm = calculateSrm(
      variations.map((v) => v.exposures),
      variations.map((v) => v.expectedWeight),
    );

    const control = variations[variations.length - 1];
    const treatment = variations[0];
    const significance =
      control && treatment && control.key !== treatment.key
        ? calculateTwoProportionZTest(
            control.exposures,
            control.conversions,
            treatment.exposures,
            treatment.conversions,
          )
        : { zScore: 0, pValue: 1, significant: false, upliftPercent: 0 };

    const dailySeries = db
      .prepare(
        `SELECT substr(occurred_at, 1, 10) as day,
                COUNT(*) as exposures
         FROM exposure_events WHERE flag_key = ?
         GROUP BY day ORDER BY day ASC`,
      )
      .all(flagKey);

    res.json({
      flagKey,
      flagName: flag.name,
      experimentId: flag.experiment_id,
      conversionEventName: flag.conversion_event_name,
      totalExposures: variations.reduce((a, b) => a + b.exposures, 0),
      totalConversions: variations.reduce((a, b) => a + b.conversions, 0),
      variations,
      srm,
      significance,
      dailySeries,
    });
  });

  app.get('/api/v1/analytics/overview', requireAuth, (_req, res) => {
    const totalProjects = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c;
    const totalFlags = (db.prepare('SELECT COUNT(*) as c FROM feature_flags WHERE archived = 0').get() as { c: number }).c;
    const enabledFlags = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT fc.flag_id) as c FROM flag_configurations fc
           JOIN feature_flags f ON f.id = fc.flag_id
           WHERE f.archived = 0 AND fc.enabled = 1 AND fc.kill_switch_active = 0`,
        )
        .get() as { c: number }
    ).c;
    const activeRollouts = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM flag_configurations fc
           JOIN feature_flags f ON f.id = fc.flag_id
           WHERE f.archived = 0 AND fc.enabled = 1 AND fc.rollout_percentage > 0 AND fc.rollout_percentage < 100`,
        )
        .get() as { c: number }
    ).c;
    const pendingApprovals = (
      db.prepare("SELECT COUNT(*) as c FROM change_requests WHERE status = 'PENDING'").get() as { c: number }
    ).c;
    const connectedSdks = (
      db.prepare("SELECT COUNT(*) as c FROM sdk_instances WHERE status = 'CONNECTED'").get() as { c: number }
    ).c;

    const recentChanges = db
      .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 8')
      .all();

    const rolloutActivity = db
      .prepare(
        `SELECT f.key as flagKey, e.name as environment, fc.rollout_percentage as rolloutPercentage,
                fc.enabled, fc.kill_switch_active as killSwitchActive, fc.updated_at as updatedAt
         FROM flag_configurations fc
         JOIN feature_flags f ON f.id = fc.flag_id
         JOIN environments e ON e.id = fc.environment_id
         WHERE f.archived = 0 AND e.key = 'production'
         ORDER BY fc.updated_at DESC LIMIT 8`,
      )
      .all();

    res.json({
      kpis: {
        totalProjects,
        totalFlags,
        enabledFlags,
        activeRollouts,
        pendingApprovals,
        connectedSdks,
      },
      recentChanges,
      rolloutActivity,
    });
  });

  app.get('/api/v1/analytics/hygiene', requireAuth, (_req, res) => {
    const flags = db
      .prepare(
        `SELECT f.*, p.name as project_name, p.key as project_key, u.name as owner_name
         FROM feature_flags f
         JOIN projects p ON p.id = f.project_id
         JOIN users u ON u.id = f.owner_id
         WHERE f.archived = 0`,
      )
      .all() as Array<Record<string, unknown>>;

    const nowMs = Date.now();
    const staleItems = [];

    for (const f of flags) {
      const prodCfg = db
        .prepare(
          `SELECT fc.* FROM flag_configurations fc
           JOIN environments e ON e.id = fc.environment_id
           WHERE fc.flag_id = ? AND e.key = 'production'`,
        )
        .get(Number(f.id)) as Record<string, unknown> | undefined;

      const lastEvalMs = f.last_evaluated_at ? Date.parse(String(f.last_evaluated_at)) : Date.parse(String(f.created_at));
      const daysSinceEval = Math.floor((nowMs - lastEvalMs) / 86400_000);
      const fullSinceMs = prodCfg?.full_rollout_since ? Date.parse(String(prodCfg.full_rollout_since)) : null;
      const daysAtFull = fullSinceMs ? Math.floor((nowMs - fullSinceMs) / 86400_000) : 0;

      const reasons: string[] = [];
      if (daysSinceEval >= 30) {
        reasons.push(`Not evaluated for ${daysSinceEval} days (>= 30d threshold)`);
      }
      if (prodCfg && Number(prodCfg.enabled) === 1 && Number(prodCfg.rollout_percentage) >= 100 && daysAtFull >= 14) {
        reasons.push(`At 100% production rollout for ${daysAtFull} days (>= 14d threshold)`);
      }

      if (reasons.length > 0) {
        staleItems.push({
          flagId: f.id,
          flagKey: f.key,
          flagName: f.name,
          projectName: f.project_name,
          ownerName: f.owner_name,
          lastEvaluatedAt: f.last_evaluated_at,
          daysSinceEval,
          rolloutPercentage: prodCfg ? Number(prodCfg.rollout_percentage) : 0,
          daysAtFullRollout: daysAtFull,
          staleReason: reasons.join(' · '),
          recommendation:
            daysSinceEval >= 30
              ? 'Archive flag and remove dead conditional branches from application code.'
              : 'Promote flag to permanent code path and archive configuration.',
        });
      }
    }
    res.json({ items: staleItems });
  });

  // ==================== AUDIT LOGS ====================
  app.get('/api/v1/audit', requireAuth, (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const size = Math.min(100, Math.max(1, Number(req.query.size || 25)));
    const action = req.query.action ? String(req.query.action) : null;
    const search = String(req.query.search || '').trim().toLowerCase();

    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: string[] = [];
    if (action) {
      sql += ' AND action = ?';
      params.push(action);
    }
    if (search) {
      sql += ' AND (lower(actor_email) LIKE ? OR lower(summary) LIKE ? OR lower(entity_id) LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY created_at DESC, id DESC';

    const all = db.prepare(sql).all(...params);
    const total = all.length;
    const items = all.slice((page - 1) * size, page * size);
    res.json({ items, page, size, total, totalPages: Math.max(1, Math.ceil(total / size)) });
  });

  return { app, bus };
}

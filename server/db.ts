import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

let dbInstance: DatabaseSync | null = null;

export function getDb(dbPath?: string): DatabaseSync {
  if (dbInstance && !dbPath) {
    return dbInstance;
  }
  const resolvedPath = dbPath ?? process.env.FLAGSHIP_DB_PATH ?? path.resolve(process.cwd(), 'flagship.db');
  const db = new DatabaseSync(resolvedPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  initSchema(db);
  if (!dbPath) {
    dbInstance = db;
  }
  return db;
}

export function resetDbForTests(dbPath = ':memory:'): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  initSchema(db);
  dbInstance = db;
  return db;
}

export function initSchema(db: DatabaseSync): void {
  db.exec(`
    -- 1. roles
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE CHECK(name IN ('VIEWER', 'EDITOR', 'APPROVER', 'ADMIN')),
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. users
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 3. projects
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. project_members
    CREATE TABLE IF NOT EXISTS project_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_name TEXT NOT NULL CHECK(role_name IN ('VIEWER', 'EDITOR', 'APPROVER', 'ADMIN')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, user_id)
    );

    -- 5. environments
    CREATE TABLE IF NOT EXISTS environments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      sdk_key TEXT NOT NULL UNIQUE,
      require_approval INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, key)
    );

    -- 6. feature_flags
    CREATE TABLE IF NOT EXISTS feature_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL CHECK(type IN ('BOOLEAN', 'STRING', 'NUMBER', 'JSON')),
      owner_id INTEGER NOT NULL REFERENCES users(id),
      default_variation_key TEXT NOT NULL,
      off_variation_key TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      experiment_active INTEGER NOT NULL DEFAULT 0,
      experiment_id TEXT,
      conversion_event_name TEXT,
      last_evaluated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, key)
    );

    -- 7. flag_variations
    CREATE TABLE IF NOT EXISTS flag_variations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flag_id INTEGER NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      value_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(flag_id, key)
    );

    -- 8. flag_configurations
    CREATE TABLE IF NOT EXISTS flag_configurations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flag_id INTEGER NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
      environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 0,
      kill_switch_active INTEGER NOT NULL DEFAULT 0,
      default_variation_key TEXT NOT NULL,
      off_variation_key TEXT NOT NULL,
      rollout_percentage REAL NOT NULL DEFAULT 0,
      rollout_variation_key TEXT,
      rollout_allocations_json TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      full_rollout_since TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(flag_id, environment_id)
    );

    -- 9. user_segments
    CREATE TABLE IF NOT EXISTS user_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      root_rule_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, key)
    );

    -- 10. segment_conditions
    CREATE TABLE IF NOT EXISTS segment_conditions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      segment_id INTEGER NOT NULL REFERENCES user_segments(id) ON DELETE CASCADE,
      attribute TEXT NOT NULL,
      operator TEXT NOT NULL,
      value TEXT NOT NULL,
      logical_op TEXT NOT NULL DEFAULT 'AND',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- 11. targeting_rules
    CREATE TABLE IF NOT EXISTS targeting_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flag_configuration_id INTEGER NOT NULL REFERENCES flag_configurations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 1,
      variation_key TEXT NOT NULL,
      root_rule_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 12. flag_targets
    CREATE TABLE IF NOT EXISTS flag_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flag_configuration_id INTEGER NOT NULL REFERENCES flag_configurations(id) ON DELETE CASCADE,
      user_key TEXT NOT NULL,
      variation_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(flag_configuration_id, user_key)
    );

    -- 13. flag_versions
    CREATE TABLE IF NOT EXISTS flag_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flag_id INTEGER NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
      environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      author_id INTEGER NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 14. change_requests
    CREATE TABLE IF NOT EXISTS change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flag_id INTEGER NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
      environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
      title TEXT NOT NULL,
      reason TEXT NOT NULL,
      before_snapshot_json TEXT NOT NULL,
      after_snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    -- 15. approvals
    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      change_request_id INTEGER NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
      approver_id INTEGER NOT NULL REFERENCES users(id),
      decision TEXT NOT NULL CHECK(decision IN ('APPROVED', 'REJECTED')),
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 16. scheduled_changes
    CREATE TABLE IF NOT EXISTS scheduled_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flag_id INTEGER NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
      environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id),
      scheduled_for TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('SCHEDULED', 'EXECUTED', 'CANCELLED')),
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      executed_at TEXT
    );

    -- 17. sdk_instances
    CREATE TABLE IF NOT EXISTS sdk_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id TEXT NOT NULL UNIQUE,
      environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      app_name TEXT NOT NULL,
      sdk_version TEXT NOT NULL,
      transport TEXT NOT NULL CHECK(transport IN ('SSE', 'POLLING')),
      status TEXT NOT NULL CHECK(status IN ('CONNECTED', 'STALE', 'DISCONNECTED')),
      last_sync_latency_ms INTEGER NOT NULL DEFAULT 0,
      last_heartbeat_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 18. exposure_events
    CREATE TABLE IF NOT EXISTS exposure_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      flag_key TEXT NOT NULL,
      experiment_id TEXT,
      user_key TEXT NOT NULL,
      variation_key TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'PERCENTAGE_ROLLOUT',
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 19. conversion_events
    CREATE TABLE IF NOT EXISTS conversion_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      flag_key TEXT NOT NULL,
      experiment_id TEXT,
      event_name TEXT NOT NULL,
      user_key TEXT NOT NULL,
      variation_key TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 1,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 20. audit_logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      diff_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_flags_project ON feature_flags(project_id);
    CREATE INDEX IF NOT EXISTS idx_cfg_flag_env ON flag_configurations(flag_id, environment_id);
    CREATE INDEX IF NOT EXISTS idx_exposure_flag ON exposure_events(flag_key, environment_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_conversion_flag ON conversion_events(flag_key, environment_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cr_status ON change_requests(status);
  `);
}

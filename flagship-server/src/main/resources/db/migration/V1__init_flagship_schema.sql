-- FlagShip PostgreSQL Schema (20 Normalized Tables)

CREATE TABLE roles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(32) NOT NULL UNIQUE CHECK (name IN ('VIEWER', 'EDITOR', 'APPROVER', 'ADMIN')),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id BIGINT NOT NULL REFERENCES roles(id),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_id BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_members (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_name VARCHAR(32) NOT NULL CHECK (role_name IN ('VIEWER', 'EDITOR', 'APPROVER', 'ADMIN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, user_id)
);

CREATE TABLE environments (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key VARCHAR(64) NOT NULL,
    name VARCHAR(120) NOT NULL,
    sdk_key VARCHAR(128) NOT NULL UNIQUE,
    require_approval BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, key)
);

CREATE TABLE feature_flags (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key VARCHAR(120) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type VARCHAR(16) NOT NULL CHECK (type IN ('BOOLEAN', 'STRING', 'NUMBER', 'JSON')),
    owner_id BIGINT NOT NULL REFERENCES users(id),
    default_variation_key VARCHAR(100) NOT NULL,
    off_variation_key VARCHAR(100) NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    experiment_active BOOLEAN NOT NULL DEFAULT FALSE,
    experiment_id VARCHAR(120),
    conversion_event_name VARCHAR(120),
    last_evaluated_at TIMESTAMPTZ,
    opt_version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, key)
);

CREATE TABLE flag_variations (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    name VARCHAR(150) NOT NULL,
    value_json JSONB NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE (flag_id, key)
);

CREATE TABLE flag_configurations (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    environment_id BIGINT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    kill_switch_active BOOLEAN NOT NULL DEFAULT FALSE,
    default_variation_key VARCHAR(100) NOT NULL,
    off_variation_key VARCHAR(100) NOT NULL,
    rollout_percentage DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    rollout_variation_key VARCHAR(100),
    rollout_allocations_json JSONB,
    version BIGINT NOT NULL DEFAULT 1,
    opt_version BIGINT NOT NULL DEFAULT 0,
    full_rollout_since TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (flag_id, environment_id)
);

CREATE TABLE user_segments (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key VARCHAR(120) NOT NULL,
    name VARCHAR(180) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    root_rule_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, key)
);

CREATE TABLE segment_conditions (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES user_segments(id) ON DELETE CASCADE,
    attribute VARCHAR(120) NOT NULL,
    operator VARCHAR(40) NOT NULL,
    value TEXT NOT NULL,
    logical_op VARCHAR(8) NOT NULL DEFAULT 'AND',
    sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE targeting_rules (
    id BIGSERIAL PRIMARY KEY,
    flag_configuration_id BIGINT NOT NULL REFERENCES flag_configurations(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    priority INT NOT NULL DEFAULT 1,
    variation_key VARCHAR(100) NOT NULL,
    root_rule_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE flag_targets (
    id BIGSERIAL PRIMARY KEY,
    flag_configuration_id BIGINT NOT NULL REFERENCES flag_configurations(id) ON DELETE CASCADE,
    user_key VARCHAR(200) NOT NULL,
    variation_key VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (flag_configuration_id, user_key)
);

CREATE TABLE flag_versions (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    environment_id BIGINT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    version BIGINT NOT NULL,
    snapshot_json JSONB NOT NULL,
    author_id BIGINT NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE change_requests (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    environment_id BIGINT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    author_id BIGINT NOT NULL REFERENCES users(id),
    status VARCHAR(24) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    title VARCHAR(255) NOT NULL,
    reason TEXT NOT NULL,
    before_snapshot_json JSONB NOT NULL,
    after_snapshot_json JSONB NOT NULL,
    opt_version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE approvals (
    id BIGSERIAL PRIMARY KEY,
    change_request_id BIGINT NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
    approver_id BIGINT NOT NULL REFERENCES users(id),
    decision VARCHAR(24) NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
    comment TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE scheduled_changes (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
    environment_id BIGINT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    author_id BIGINT NOT NULL REFERENCES users(id),
    scheduled_for TIMESTAMPTZ NOT NULL,
    payload_json JSONB NOT NULL,
    status VARCHAR(24) NOT NULL CHECK (status IN ('SCHEDULED', 'EXECUTED', 'CANCELLED')),
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);

CREATE TABLE sdk_instances (
    id BIGSERIAL PRIMARY KEY,
    instance_id VARCHAR(150) NOT NULL UNIQUE,
    environment_id BIGINT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    app_name VARCHAR(150) NOT NULL,
    sdk_version VARCHAR(32) NOT NULL,
    transport VARCHAR(16) NOT NULL CHECK (transport IN ('SSE', 'POLLING')),
    status VARCHAR(24) NOT NULL CHECK (status IN ('CONNECTED', 'STALE', 'DISCONNECTED')),
    last_sync_latency_ms INT NOT NULL DEFAULT 0,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE exposure_events (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    environment_id BIGINT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    flag_key VARCHAR(120) NOT NULL,
    experiment_id VARCHAR(120),
    user_key VARCHAR(200) NOT NULL,
    variation_key VARCHAR(100) NOT NULL,
    reason VARCHAR(40) NOT NULL DEFAULT 'PERCENTAGE_ROLLOUT',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversion_events (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    environment_id BIGINT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    flag_key VARCHAR(120) NOT NULL,
    experiment_id VARCHAR(120),
    event_name VARCHAR(120) NOT NULL,
    user_key VARCHAR(200) NOT NULL,
    variation_key VARCHAR(100) NOT NULL,
    value DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
    actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    actor_email VARCHAR(255) NOT NULL,
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    summary TEXT NOT NULL,
    diff_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flags_project ON feature_flags(project_id);
CREATE INDEX idx_cfg_flag_env ON flag_configurations(flag_id, environment_id);
CREATE INDEX idx_exposure_flag_env_time ON exposure_events(flag_key, environment_id, occurred_at);
CREATE INDEX idx_conversion_flag_env_time ON conversion_events(flag_key, environment_id, occurred_at);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_cr_status ON change_requests(status);

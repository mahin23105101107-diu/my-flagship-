# FlagShip Database Design

FlagShip persists state across **20 normalized relational tables** managed via Flyway (`V1__init_flagship_schema.sql`) in PostgreSQL 16 (and mirrored identically in `server/db.ts` SQLite for the self-contained preview runtime).

## Entity-Relationship Diagram

```mermaid
erDiagram
    roles ||--o{ users : "assigned_to"
    users ||--o{ projects : "owns"
    projects ||--o{ project_members : "has"
    users ||--o{ project_members : "belongs_to"
    projects ||--o{ environments : "contains"
    projects ||--o{ feature_flags : "defines"
    projects ||--o{ user_segments : "scopes"
    user_segments ||--o{ segment_conditions : "details"

    feature_flags ||--o{ flag_variations : "has"
    feature_flags ||--o{ flag_configurations : "configured_per_env"
    environments ||--o{ flag_configurations : "hosts"
    flag_configurations ||--o{ targeting_rules : "evaluates"
    flag_configurations ||--o{ flag_targets : "pins"

    feature_flags ||--o{ flag_versions : "snapshots"
    feature_flags ||--o{ change_requests : "proposes"
    change_requests ||--o{ approvals : "reviewed_by"
    feature_flags ||--o{ scheduled_changes : "schedules"

    environments ||--o{ sdk_instances : "connects"
    environments ||--o{ exposure_events : "records"
    environments ||--o{ conversion_events : "tracks"
    projects ||--o{ audit_logs : "audits"
```

## Key Integrity & Performance Decisions
1. **Unique Composite Keys**: `(project_id, key)` on `environments`, `feature_flags`, and `user_segments`; `(flag_id, environment_id)` on `flag_configurations`; `(flag_configuration_id, user_key)` on `flag_targets`.
2. **Optimistic Locking**: `opt_version` on `feature_flags`, `flag_configurations`, and `change_requests` prevents lost concurrent updates.
3. **High-Volume Event Indexes**: Composite B-tree indexes on `(flag_key, environment_id, occurred_at)` keep experiment aggregation queries fast as exposure and conversion logs grow.
4. **Transactional Approval Boundary**: Approving a `change_request` atomically updates `flag_configurations`, inserts a `flag_versions` snapshot, creates an `approvals` record, and writes an `audit_logs` entry.

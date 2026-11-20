# MEMORY.md — FlagShip Project Context & Progress

## Current Phase
Phase 9: Final Verification Complete

## Environment Reality Check
- Runtime environment: Linux container with Node.js `v22.23.2`, npm, Vite 8, TypeScript, Express 4.21, Recharts, Vitest.
- `java`, `mvn`, `docker`, and `psql` are **not installed** in this container (recorded in `ERROR.md` ERR-001).
- Live full-stack Node.js + Express + `node:sqlite` + React 19 Admin Dashboard runs on port 3000 with full `/api/v1/*` REST + SSE endpoints.
- Complete Java 21 / Spring Boot 4.x / Maven multi-module codebase (`pom.xml`, `flagship-shared`, `flagship-sdk`, `flagship-server`, `flagship-sample-app`), Flyway PostgreSQL schema (`V1__init_flagship_schema.sql`), `docker-compose.yml`, CI workflow, and k6 load script are authored and structured in the workspace.

## Architecture Overview
- **Modular Monolith** with shared deterministic evaluation core (`flagship-shared` in Java, `src/shared/engine.ts` in TypeScript).
- **12 Domain Modules**: Auth, Projects, Environments, Feature Flags, Targeting Engine, Rollout Engine, SDK Management, Change Control, Approval Workflow, Experiment Analytics, Flag Hygiene, Audit & Monitoring.
- **Database Schema (20 tables)**: `users`, `roles`, `projects`, `project_members`, `environments`, `feature_flags`, `flag_variations`, `flag_configurations`, `targeting_rules`, `user_segments`, `segment_conditions`, `flag_targets`, `flag_versions`, `change_requests`, `approvals`, `scheduled_changes`, `sdk_instances`, `exposure_events`, `conversion_events`, `audit_logs`.

## Completed Features
- [x] Phase 1: Workspace inspection & `AGENT.md`, `MEMORY.md`, `ERROR.md`
- [x] Phase 2: 20-table SQLite & Flyway PostgreSQL schemas + Maven multi-module & Docker Compose setup
- [x] Phase 3: Full `/api/v1/*` REST + SSE backend, JWT + BCrypt security, RBAC, RFC 9457 errors, approval workflow with self-approval prevention, rollback, scheduled rollouts
- [x] Phase 4: Spring Boot Starter SDK (`flagship-spring-boot-starter`, `flagship-spring-boot-autoconfigure`, `@FeatureFlag` AOP, `/actuator/flagship`, `SnapshotStore`, `flagship-sample-app`) + Live Browser SDK Offline/SSE Simulator
- [x] Phase 5: 18-page Responsive Light/Dark FlagShip Admin Dashboard wired to real APIs
- [x] Phase 6: Experiment Analytics (SRM Chi-Square + Two-Proportion Z-Test), Flag Hygiene (`>=30d` unused / `>=14d` 100%)
- [x] Phase 7: Vitest unit, API integration, and 50-client SSE propagation tests + 1,000,000-user QA1/QA4 benchmark
- [x] Phase 8: C4 diagrams, ER diagram, 4 ADRs, Utility Tree & Mini-ATAM, Design Pattern Table, Evidence Report, AI Usage Log, Live Defence Guide, README
- [x] Phase 9: Final `tsc --noEmit`, `vite build`, and `vitest run` verification

## Measured Verification Evidence (Node.js / Vitest Runtime)
- `vitest run`: 3 test files, 9 tests passed.
- QA1 (10 rules, 100k iterations): `p50 = 2.01 µs`, `p95 = 3.61 µs`, `p99 = 8.03 µs` (SLA `<= 50 µs`).
- QA3 (50 concurrent SSE clients): `p95 = 48.53 ms`, `max = 49.67 ms` (SLA `<= 5,000 ms`).
- QA4 (1,000,000 user keys): `9.965%` at 10%, `19.949%` at 20%, `0` cohort violations.

## Known Limitations
- Maven (`mvn test`) and Docker Compose (`docker compose up --build`) could not be executed inside this sandbox container because `java`, `mvn`, and `docker` are absent; they are ready for execution on a host with JDK 21, Maven 3.9+, and Docker.

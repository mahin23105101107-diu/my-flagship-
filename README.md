# FlagShip

**Ship Features. Control Releases. Stay Resilient.**

FlagShip is a self-hosted Feature-Flag, Targeting, Gradual-Rollout, and Experiment Analytics Platform with a reusable Spring Boot Starter SDK, built for **CSE 444 — Software Architecture and Design Patterns**.

---

## Core Capabilities

- **Feature Flag Management (FR1)**: Multi-project, multi-environment (`Development`, `Staging`, `Production`) flags supporting `BOOLEAN`, `STRING`, `NUMBER`, and `JSON` variations.
- **Targeting Engine (FR2)**: Priority evaluation chain (`Kill Switch -> Individual User Targets -> Segment Rules -> Percentage Rollout -> Default`) with nested `AND`/`OR` Composite rules and 8 Strategy operators (`EQUALS`, `NOT_EQUALS`, `IN`, `CONTAINS`, `SEMVER_GREATER_THAN`, `REGEX`, `DATE_BEFORE`, `DATE_AFTER`).
- **Deterministic Sticky Rollouts (FR3)**: MurmurHash3 32-bit bucketing (`1%`–`100%`) shared identically between server and SDK; expanding a rollout from `10%` to `20%` preserves 100% of the original `10%` cohort.
- **Spring Boot Starter SDK (FR4 & FR6)**: Auto-configured `FlagShipClient`, `@FeatureFlag` AOP guard, local disk snapshot persistence, `< 2s` startup timeout, offline evaluation without uncaught exceptions, custom `/actuator/flagship` endpoint, and Micrometer metrics.
- **Live SSE Updates (FR5)**: Server-Sent Events (`/api/v1/sdk/stream`) broadcast flag updates to connected applications in `< 5s` (measured `48.53 ms` p95 across 50 concurrent SSE streams) with automatic polling fallback.
- **Change Control & Peer Approval (FR7)**: Immutable version snapshots, before/after diffs, one-click rollback, scheduled releases, 4-tier RBAC (`VIEWER`, `EDITOR`, `APPROVER`, `ADMIN`), and strict self-approval prevention.
- **Experiment Analytics & Flag Hygiene (FR8 & FR9)**: Batched SDK exposure/conversion ingestion, Two-Proportion Z-test significance, Chi-Square Sample Ratio Mismatch (SRM) detection, and stale flag alerts (`>= 30d` unevaluated or `>= 14d` at 100%).
- **18-Page Admin Web Console (FR10)**: Complete React + TypeScript + Tailwind CSS dashboard connected to real `/api/v1/*` APIs.

---

## Running FlagShip

### Option A: Live Full-Stack Runtime (Node.js 22 + Express + SQLite + React)
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

**Seeded Demo Credentials** (password for all accounts: `flagship123`):
- `admin@flagship.dev` (`ADMIN` — Aria Vance)
- `approver@flagship.dev` (`APPROVER` — Marcus Chen)
- `editor@flagship.dev` (`EDITOR` — Elena Rostova)
- `viewer@flagship.dev` (`VIEWER` — Devon Brooks)

### Option B: Full Java 21 + Spring Boot 4.x + PostgreSQL + Docker Compose
Requires Docker Desktop / Docker Engine and JDK 21 + Maven on the host machine:
```bash
docker compose up --build
```
- **Frontend**: `http://localhost:3000`
- **Spring Boot API & Swagger UI**: `http://localhost:8080/swagger-ui.html`
- **Actuator Health**: `http://localhost:8080/actuator/health`

---

## 15-Minute Spring Boot Starter Quick-Start (QA5)

1. Add the dependency to `pom.xml`:
```xml
<dependency>
  <groupId>io.flagship</groupId>
  <artifactId>flagship-spring-boot-starter</artifactId>
  <version>1.0.0</version>
</dependency>
```
2. Configure `application.yml`:
```yaml
flagship:
  server-url: http://localhost:3000
  sdk-key: fs_prod_core_commerce_001
  startup-timeout-ms: 1500
  snapshot-file: ./data/flagship-snapshot.json
```
3. Guard any Spring bean method with `@FeatureFlag("new-dashboard")` or inject `FlagShipClient` (`flagship-sample-app/` provides a complete working example).

---

## Documentation Index

- [`AGENT.md`](AGENT.md) — Development rules and quality checklist
- [`MEMORY.md`](MEMORY.md) — Current implementation status and architectural decisions
- [`ERROR.md`](ERROR.md) — Error log and environment limitation disclosures
- [`docs/architecture.md`](docs/architecture.md) — C4 Context, Container, and Component diagrams
- [`docs/database-design.md`](docs/database-design.md) — 20-table PostgreSQL ER diagram and indexing
- [`docs/design-patterns.md`](docs/design-patterns.md) — Design Pattern justification table (C8)
- [`docs/utility-tree.md`](docs/utility-tree.md) — Quality Attribute Utility Tree & Mini-ATAM (C7)
- [`docs/performance-report.md`](docs/performance-report.md) — Actual measured QA1–QA4 evidence report (C9)
- [`docs/testing-guide.md`](docs/testing-guide.md) — Test execution instructions
- [`docs/ai-usage-log.md`](docs/ai-usage-log.md) — AI engineering log and corrections (C11)
- [`docs/live-defence-guide.md`](docs/live-defence-guide.md) — 15-minute live defence walkthrough (C12)
- [`docs/adr/`](docs/adr/) — Architecture Decision Records (`ADR-001` to `ADR-004`)

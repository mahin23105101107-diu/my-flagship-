# FlagShip Testing & Verification Guide

## 1. Executed Test Suites (Node.js / Express / React / Vitest)
Run the automated unit, API integration, and 50-client SSE propagation suites:
```bash
npm test
```

### Included Test Files
- `tests/engine.test.ts`: Chain of Responsibility precedence, all 8 Strategy operators, nested AND/OR Composite rule trees, 10%->20% sticky cohort preservation, Chi-Square SRM detection, Two-Proportion Z-test.
- `tests/api.test.ts`: JWT authentication, RFC 9457 Problem Details errors, variation type validation, Production change request gating, self-approval prevention (`403`), peer approval, version rollback, batched event ingestion, and stale flag hygiene.
- `tests/resilience.test.ts`: Live kill-switch propagation via SSE across 50 concurrent SDK streams (`< 5,000 ms` p95).

### Run Quality Benchmarks (QA1 & QA4)
```bash
node tests/benchmark.ts
```
Evaluates 100,000 iterations with 10 rules (latency p50/p95/p99), 1,000-flag cache memory delta, and 1,000,000 user keys across 10% and 20% rollouts.

---

## 2. Java 21 / Maven / Testcontainers / ArchUnit Suite (Host with JDK 21 + Docker)
```bash
mvn test
```
- `FlagEvaluationEngineTest`: 1,000,000-user deterministic MurmurHash3 parity and cohort preservation.
- `OfflineResilienceTest`: Verifies SDK boots in `< 2,000 ms` from saved disk snapshot when central server is unreachable.
- `ArchitectureTest`: ArchUnit enforcement of modular monolith package boundaries.
- `ApprovalAndRolloutIntegrationTest`: Testcontainers PostgreSQL 16 integration test with Flyway migrations.

---

## 3. k6 Load Test (Optional Host Tool)
```bash
k6 run tests/k6/flagship-load.js
```
Simulates 50 virtual SDK instances polling `/api/v1/sdk/snapshot` and posting `/api/v1/events/batch`.

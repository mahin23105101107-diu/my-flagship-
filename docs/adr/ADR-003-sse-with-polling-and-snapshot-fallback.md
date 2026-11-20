# ADR-003: Server-Sent Events (SSE) Primary Transport with Polling & Local Snapshot Fallback

## Context
Emergency kill switches must reach 50 connected application instances within 5 seconds at p95 (QA3), while host applications must survive 30-minute central server outages and cold restarts without throwing exceptions or blocking startup beyond 2 seconds (QA2).

## Problem
What synchronization and resilience mechanism should connect `flagship-server` and `flagship-spring-boot-starter`?

## Options Considered
1. **Short-Interval Polling Only (e.g., every 1s)**: Violates server efficiency at 50+ pods or misses the 5s kill-switch SLA if interval is increased to 30s.
2. **WebSockets / STOMP**: Bidirectional overhead unnecessary for one-way server-to-SDK config pushes and requires extra broker/firewall setup.
3. **SSE (`text/event-stream`) + 30s Polling Fallback + Atomic Local Disk Snapshot**: Lightweight standard HTTP streaming with automatic reconnection, bounded `< 2s` startup sync timeout, and local JSON disk persistence (`SnapshotStore`).

## Decision
Use **SSE as primary live channel**, backed by **periodic polling fallback** and **atomic local disk snapshot persistence**.

## Consequences & Evidence
- Measured **48.53 ms p95** propagation across 50 concurrent SSE streams (`tests/resilience.test.ts`), beating the 5,000 ms SLA.
- SDK boots immediately from disk snapshot even when the central server is completely offline (`OfflineResilienceTest.java`).

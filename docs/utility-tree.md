# Utility Tree & Mini-ATAM Analysis (Requirement C7)

## 1. Quality Attribute Utility Tree

| Quality Attribute | Refinement | Concrete Quality Scenario | Priority (Importance, Difficulty) | Target |
|-------------------|------------|---------------------------|-----------------------------------|--------|
| **Performance (QA1)** | Local Evaluation Latency | Host Spring Boot app evaluates a flag with 10 targeting rules using cached in-memory snapshot under normal load. | `(H, M)` | `<= 50 µs` at p99 |
| **Performance (QA1)** | SDK Memory Footprint | Host app caches 1,000 feature flags and associated segments in SDK memory. | `(H, L)` | `<= 20 MB` additional heap |
| **Availability & Resilience (QA2)** | Central Server Outage | Central FlagShip server goes offline for 30 minutes; host app restarts during outage with a saved disk snapshot. | `(H, H)` | Startup `<= 2,000 ms`; `0` uncaught exceptions; evaluates from saved snapshot |
| **Freshness (QA3)** | Kill-Switch Propagation | Operator activates a kill switch in Production while 50 SDK instances are connected via SSE. | `(H, M)` | All 50 instances receive update within `<= 5,000 ms` at p95 |
| **Consistency (QA4)** | Deterministic Bucketing | Server preview and SDK evaluate `1,000,000` distinct user keys for a flag expanding from `10%` to `20%`. | `(H, M)` | `100%` server/SDK parity; `0` cohort violations on `10% -> 20%` |
| **Usability / Adoption (QA5)** | Developer Onboarding | An unfamiliar Spring Boot developer integrates `flagship-spring-boot-starter` and guards a method with `@FeatureFlag`. | `(M, L)` | `<= 15 minutes` using quick-start guide |
| **Security** | Change Governance | An `EDITOR` or `APPROVER` attempts to approve their own Production change request. | `(H, L)` | `100%` blocked with HTTP `403` (`Self-Approval Forbidden`) |

---

## 2. Sensitivity Points & Trade-Off Points

### Sensitivity Points
1. **Hash Function & Modulo Precision (`MurmurHash3`)**: Changing the seed (`0x9747b28c`) or modulo (`10,000` buckets) immediately changes every user's rollout assignment across all flags.
2. **SDK Startup Timeout (`flagship.startup-timeout-ms`)**: Increasing beyond `2,000 ms` delays host application boot during FlagShip outages; decreasing below `200 ms` risks skipping fresh snapshot fetch on cold starts.
3. **SSE Connection Pool & Keep-Alive**: Long-lived SSE streams hold open HTTP worker threads/sockets; reverse-proxy idle timeouts must exceed the 15s keepalive heartbeat.

### Trade-Off Points
1. **Modular Monolith vs. Microservices**:
   - *Trade-off*: Sacrifices independent horizontal scaling of analytics ingestion vs. flag CRUD in exchange for ACID transactions (approvals + version snapshots + audit logs), lower RAM footprint (`< 2 GB` total for Docker Compose on an 8 GB laptop), and zero distributed-consensus overhead.
2. **In-Memory Snapshot + Eventual Event Batching vs. Synchronous Server Evaluation**:
   - *Trade-off*: Evaluation achieves `< 50 µs` p99 and survives 30-minute server outages, at the cost of eventual consistency (`<= 5s` SSE window) and slightly delayed exposure event persistence (`10s` batch flush).
3. **Production Peer Approval Gate vs. Instant Deployment Velocity**:
   - *Trade-off*: Requiring peer approval adds human review latency to Production rollouts, balanced by keeping an explicit **Emergency Kill Switch** path for `APPROVER`/`ADMIN` roles during live incidents.

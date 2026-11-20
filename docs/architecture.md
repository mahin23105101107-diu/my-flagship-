# FlagShip System Architecture (C4 & Modular Monolith)

## 1. Architectural Style
FlagShip uses a **Modular Monolith** architecture (`flagship-server`) paired with a zero-dependency shared evaluation kernel (`flagship-shared`), a reusable client library (`flagship-sdk`), and a React SPA Admin Dashboard.

---

## 2. C4 Level 1 — System Context Diagram

```mermaid
C4Context
    title System Context Diagram — FlagShip Platform

    Person(admin, "Release Admin / Approver", "Reviews production changes, triggers kill switches, manages team roles")
    Person(dev, "Product Developer / Editor", "Creates feature flags, targeting rules, experiments, and schedules rollouts")

    System(flagship, "FlagShip Platform", "Self-hosted feature flag control plane, SSE streaming server, and experiment analytics")
    System_Ext(clientApp, "Host Spring Boot Applications", "Microservices embedding flagship-spring-boot-starter for sub-50us local evaluation")

    Rel(admin, flagship, "Approves changes, audits history, monitors SDKs", "HTTPS / React UI")
    Rel(dev, flagship, "Configures flags, segments, and rollouts", "HTTPS / React UI")
    Rel(clientApp, flagship, "Subscribes to SSE snapshots & flushes batched events", "HTTPS / SSE + REST")
```

---

## 3. C4 Level 2 — Container Diagram

```mermaid
C4Container
    title Container Diagram — FlagShip Deployment

    Person(operator, "Engineering Team", "Admin, Approver, Editor, Viewer")

    Container(spa, "FlagShip Admin Dashboard", "React 19, TypeScript, Vite, Tailwind, Recharts", "18-page control plane UI")
    Container(api, "FlagShip Control Plane Server", "Spring Boot 4.x / Express Mirror", "REST APIs, JWT RBAC, SSE Bus, Rollout & Analytics")
    ContainerDb(db, "Primary Relational Database", "PostgreSQL 16 (Flyway) / SQLite Mirror", "20 normalized tables for flags, rules, approvals, events, audits")
    Container(sdk, "Host App + FlagShip Starter", "Java 21 + flagship-spring-boot-starter", "In-memory cache, local disk snapshot, @FeatureFlag AOP")

    Rel(operator, spa, "Uses", "HTTPS :3000")
    Rel(spa, api, "Calls REST & SSE", "JSON / EventStream")
    Rel(api, db, "Reads & writes transactionally", "JDBC / SQL")
    Rel(sdk, api, "Streams updates & sends event batches", "SSE / HTTPS")
```

---

## 4. C4 Level 3 — Component Diagram (Backend Control Plane)

```mermaid
C4Component
    title Component Diagram — flagship-server Modular Monolith

    Component(auth, "Auth & RBAC Module", "Spring Security + JWT", "Password hashing, token issuance, project membership checks")
    Component(flagMod, "Flag & Environment Module", "REST + Service", "CRUD for projects, environments, typed flags, variations")
    Component(targetingMod, "Targeting & Segment Module", "Composite + Strategy", "Priority rule storage and reusable user segments")
    Component(approvalMod, "Change & Approval Module", "Command + Transactional", "Change requests, before/after diff, peer approval, rollback")
    Component(sdkMod, "SDK Stream & Registry Module", "Observer / SseEmitter", "Publishes instant SSE config updates & tracks pod heartbeats")
    Component(analyticsMod, "Analytics & Hygiene Module", "Chi-Square + Z-test", "Experiment exposure/conversion stats, SRM, stale flag detection")
    Component(sharedCore, "flagship-shared Engine", "Pure Java / TS", "MurmurHash3 bucketing & 5-stage Chain of Responsibility")

    Rel(flagMod, sharedCore, "Previews evaluations")
    Rel(approvalMod, sdkMod, "Publishes approved changes")
    Rel(approvalMod, flagMod, "Applies/rolls back configuration snapshots")
    Rel(auth, flagMod, "Secures endpoints")
```

---

## 5. Module Dependency Boundaries (Enforced by ArchUnit)
1. `common` must never depend on feature modules (`auth`, `flag`, `approval`, `sdk`).
2. `auth` remains decoupled from `approval` and `sdk`.
3. `flagship-shared` contains zero Spring/web/JPA dependencies so both `flagship-server` and `flagship-sdk` execute identical evaluation logic.

---

## 6. Checkpoint Change Request (C10 Placeholder)
> **Reserved for Instructor Checkpoint Change Request**
> Status: Awaiting instructor specification during course checkpoint review. No speculative changes have been invented.

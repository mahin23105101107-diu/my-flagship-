# AGENT.md — FlagShip Development Instructions

## 1. Project Overview

**FlagShip** is a self-hosted Feature-Flag and Gradual-Rollout Platform with a Spring Boot Starter, built for CSE 444 Software Architecture and Design Patterns.

Core capabilities:
- Project & Environment management (Development, Staging, Production)
- Feature Flags (Boolean, String, Number, JSON) with named variations and kill switches
- Deterministic Sticky Percentage Rollout (1%–100%, cohort-preserving, MurmurHash3 / SHA-256)
- Targeting Engine with Chain of Responsibility evaluation order:
  1. Kill Switch
  2. Individual User Targets
  3. Segment Rules (Composite AND/OR nested groups + Strategy operators)
  4. Percentage Rollout
  5. Default Variation
- Live configuration updates via Server-Sent Events (SSE) with polling fallback (< 5s propagation)
- Offline-resilient Spring Boot Starter SDK (in-memory cache, local disk snapshot persistence, < 2s startup timeout, safe defaults, AOP `@FeatureFlag`, Actuator endpoint, Micrometer metrics)
- Change Control & Production Approval Workflow (versioning, before/after diff, rollback, scheduled changes, self-approval prevention)
- Experiment Analytics (batched exposure & conversion events, conversion rate, Sample Ratio Mismatch chi-square check, z-test statistical significance)
- Flag Hygiene (stale flag detection: unused > 30 days or 100% rolled out > 14 days)
- 18-page Responsive SaaS Admin Dashboard

## 2. Technology Stack

- **Backend (Primary Course Reference Implementation)**: Java 21, Spring Boot 4.x (Modular Monolith), Spring Web, Spring Security (JWT + RBAC), Spring Data JPA, Flyway, Spring Validation, Spring AOP, Spring Actuator, SSE, Springdoc OpenAPI, Maven, PostgreSQL.
- **Live Runtime Mirror (AI Studio Preview / Express Runtime)**: Node.js 22 + Express + TypeScript (`server.ts`) + `node:sqlite` implementing the exact `/api/v1/*` REST + SSE contract, deterministic bucketing, targeting engine, RBAC, versioning, analytics, and hygiene logic.
- **SDK**: Reusable Maven Spring Boot Starter (`flagship-spring-boot-starter`, `flagship-spring-boot-autoconfigure`) + `flagship-shared` evaluation core + sample Spring Boot app.
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, Lucide Icons.
- **Testing & Verification**: JUnit 5, Mockito, Testcontainers, ArchUnit, Vitest, React Testing Library, k6 load script, 1,000,000-user consistency & latency benchmark.
- **Deployment**: Docker, Docker Compose, GitHub Actions CI.

## 3. Architecture Rules

1. **Modular Monolith**: Clear module boundaries (`auth`, `project`, `environment`, `flag`, `targeting`, `rollout`, `sdk`, `change`, `approval`, `analytics`, `hygiene`, `audit`). No microservices.
2. **Dependency Direction**: Controllers -> Application Services -> Domain Models/Engines -> Repositories. Domain engines (`TargetingEngine`, `RolloutEngine`) live in `flagship-shared` with zero framework dependencies so Server and SDK share identical evaluation logic.
3. **Design Patterns**: Only apply patterns solving concrete requirements:
   - Strategy (Targeting operators, Rollout hashers)
   - Composite (Nested AND/OR rule groups)
   - Visitor (Rule tree evaluation & explanation trace)
   - Chain of Responsibility (5-step flag evaluation pipeline)
   - Observer (SSE / configuration update broadcasting)
   - Proxy / Decorator (Cached & instrumented SDK evaluation)
   - Command (Versioned flag changes & deterministic rollback)
   - Builder (`EvaluationContext.builder()`)
4. **Security**: BCrypt password hashing, JWT bearer auth, SDK API keys, RBAC (`VIEWER`, `EDITOR`, `APPROVER`, `ADMIN`), project-level access checks, self-approval prevention on production changes, RFC 9457 Problem Details for errors.

## 4. Coding Standards

- Clean, readable Java 21 and strict TypeScript.
- Separate business logic from HTTP controllers.
- Validate all request payloads (Bean Validation in Spring, explicit schema validation in Express).
- Never store plaintext passwords or hardcode production secrets in source control.
- Use tabular numerals (`tabular-nums`) and accessible semantic status labels in UI.

## 5. Development & Quality Workflow

1. Read `AGENT.md` and `MEMORY.md` before starting any phase.
2. Implement phase by phase (Architecture -> Backend/Server -> SDK -> Frontend -> Tests -> Docs).
3. Run tests after each major change; never claim a test or performance metric passed without actually running it.
4. Record all real errors, root causes, fixes, and verification results in `ERROR.md`.
5. Update `MEMORY.md` after every completed phase.
6. Report environment limitations honestly (e.g., if `java`/`mvn`/`docker` are unavailable in a sandbox).

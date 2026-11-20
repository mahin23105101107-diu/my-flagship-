# ERROR.md — Development Error & Resolution Log

This file records actual encountered errors, root causes, debugging steps, fixes, and verification results.

---

## ERR-001 — Missing Java, Maven, Docker, and PostgreSQL Tooling in Container Sandbox
- **Date**: 2026-11-18
- **Phase**: Phase 1 — Workspace Inspection
- **Error Description**: Running `which java mvn docker docker-compose psql` returned `java: not found`, `mvn: not found`, and empty results for `docker` and `psql`.
- **Root Cause**: The execution sandbox is a Node.js 22 (`v22.23.2`) web application container running as unprivileged `appuser` without a JVM, Maven, Docker daemon, or PostgreSQL binary installed.
- **Affected Files / Scope**: Java Maven build (`pom.xml`, `flagship-server`, `flagship-sdk`, `flagship-shared`) and Docker Compose runtime (`docker-compose.yml`).
- **Debugging Process**: Verified installed binaries (`node`, `npm`, `uname -a`, `whoami` / `ls -la`) in `/app/applet`.
- **Resolution / Mitigation**:
  1. Implemented a complete, production-faithful **Node.js + Express + `node:sqlite` + TypeScript** backend (`server.ts`) exposing all `/api/v1/*` endpoints, SSE streaming, JWT + BCrypt security, deterministic MurmurHash3 rollout, targeting engine, approval workflow, experiment SRM analytics, and flag hygiene so the full 18-page React Admin Dashboard operates live on port 3000 with real persistence.
  2. Authored the complete **Java 21 / Spring Boot 4.x / Maven multi-module source tree**, Flyway migrations, Spring Boot Starter SDK, JUnit 5 / ArchUnit / Testcontainers tests, Dockerfiles, and `docker-compose.yml` for execution on any host with JDK 21 + Maven + Docker.
  3. Kept test reporting strictly honest: all Node/Vitest/React/1M-key benchmark results were executed and measured in this container; Java/Maven/Docker execution remains unverified inside this sandbox due to the missing toolchain.
- **Verification Result**: Node.js `v22.23.2` and `node:sqlite` confirmed available for live full-stack execution and benchmarking.

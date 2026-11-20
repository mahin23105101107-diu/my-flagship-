# ADR-001: Modular Monolith Architecture for FlagShip Control Plane

## Context
FlagShip requires project/environment management, flag CRUD, targeting rules, production approval workflows, audit logging, SSE live updates, and experiment analytics while running smoothly on an 8 GB RAM developer laptop via a single `docker compose up --build` command.

## Problem
Should the FlagShip backend be split into multiple microservices (e.g., Auth Service, Flag Service, Approval Service, Analytics Service) or built as a Modular Monolith?

## Options Considered
1. **Microservices with Kafka/RabbitMQ**: Independent deployability, but adds JVM memory overhead (multiple Spring Boot runtimes > 3–4 GB RAM), distributed transaction complexity (approvals spanning flag state + version history + audit log), and message broker setup.
2. **Modular Monolith (`flagship-server`)**: Single deployable backend organized into strict domain packages (`auth`, `project`, `environment`, `flag`, `targeting`, `rollout`, `approval`, `analytics`, `hygiene`, `sdk`, `audit`), enforced by ArchUnit tests, sharing one ACID PostgreSQL database.

## Decision
Select the **Modular Monolith** architecture with ArchUnit package boundary rules (`ArchitectureTest.java`).

## Consequences
- **Positive**: ACID transactions across `change_requests`, `approvals`, `flag_configurations`, `flag_versions`, and `audit_logs`; total Docker stack fits comfortably within 1.6 GB RAM; fast local iteration.
- **Negative**: Event ingestion scales vertically with the monolith; if high-throughput analytics outgrows single-node capacity later, the `analytics` package can be extracted cleanly because module boundaries are already enforced.

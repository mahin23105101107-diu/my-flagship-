# ADR-002: Deterministic MurmurHash3 32-Bit Bucketing for Sticky Rollouts

## Context
Gradual rollouts (`1%`–`100%`) must evaluate identically on the central server preview and inside every Spring Boot SDK instance without network round-trips or sticky session storage. Expanding a rollout from `10%` to `20%` must retain 100% of users already in the `10%` cohort.

## Problem
How should FlagShip map `(flagKey, userKey)` pairs to percentage buckets deterministically across Java and TypeScript runtimes?

## Options Considered
1. **Random Assignment + Redis Cache**: Requires network calls and persistent cache; fails during server outages.
2. **Java `String.hashCode()`**: Fast, but weak distribution and inconsistent across non-JVM runtimes (e.g., TypeScript dashboard preview).
3. **MurmurHash3 32-bit (`seed = 0x9747b28c`) with 10,000-bucket modulo**: Uniform avalanche distribution, identical bit-exact algorithm in Java (`MurmurHash3.java`) and TypeScript (`src/shared/engine.ts`).

## Decision
Use **MurmurHash3 32-bit** hashing `flagKey + ":" + userKey` modulo `10,000` (`[0.00, 99.99]`).

## Consequences & Evidence
- Measured across **1,000,000 user keys** (`tests/benchmark.ts`): `9.965%` at 10% target, `19.949%` at 20% target, and **`0` cohort violations** when expanding from 10% to 20%.
- Changing the hash seed or input concatenation format would reshuffle all user assignments (documented sensitivity point).

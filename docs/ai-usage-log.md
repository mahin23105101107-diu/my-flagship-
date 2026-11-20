# AI Usage Log & Process Evidence (Requirement C11)

## 1. Tooling Used
- AI coding agent inside Google AI Studio Build for architecture scaffolding, full-stack TypeScript/React implementation, Java 21 / Spring Boot 4.x reference modules, test generation, and documentation.
- Verification tools executed directly: `npm run lint` (`tsc --noEmit`), `npm run build` (`vite build`), `npm test` (`vitest run`), and `node tests/benchmark.ts`.

## 2. Key Architectural Prompts & Decisions
1. Designed a dual-artifact strategy after inspecting the sandbox environment (`which java mvn docker` missing): live Node.js 22 + Express + SQLite + React full-stack runtime on port 3000 AND complete Maven multi-module Java 21 / Spring Boot 4.x + Docker Compose codebase.
2. Enforced identical MurmurHash3 32-bit constants (`seed = 0x9747b28c`, `c1 = 0xcc9e2d51`, `c2 = 0x1b873593`) across `src/shared/engine.ts` and `MurmurHash3.java`.

## 3. Actual Incorrect / Incomplete Outputs & Corrections

### Example 1: Recharts `Tooltip` Formatter Type Signature Failure
- **What went wrong**: Generated `formatter={(value: number) => ...}` in `OverviewPage.tsx` and `AnalyticsAndHygienePages.tsx`.
- **Detection**: `npm run lint` (`tsc --noEmit`) failed with `TS2322: Type 'ValueType | undefined' is not assignable to type 'number'`.
- **Fix**: Updated formatter callback signatures to `(value) => [`${value ?? 0}%`, ...]` matching Recharts' generic `ValueType | undefined` contract.
- **Verification**: Re-ran `tsc --noEmit` to confirm zero errors.

### Example 2: Unnarrowed `unknown` Parameters Passed to `node:sqlite` Prepared Statements
- **What went wrong**: Several `PATCH` handlers in `server/app.ts` passed `existing.name` or `flag.experiment_active` from `Record<string, unknown>` directly into `StatementSync.run(...)`.
- **Detection**: `tsc --noEmit` rejected `unknown` against `SQLInputValue`.
- **Fix**: Explicitly coerced nullable and typed fields (`String(...)`, `Number(...)`, `... ? String(...) : null`) before binding SQL parameters.
- **Verification**: Confirmed clean `tsc --noEmit` compilation and passing `tests/api.test.ts`.

### Example 3: `jwt.verify` Payload Cast Error Under Strict TypeScript
- **What went wrong**: `jwt.verify(token, secret) as { sub: number; ... }` failed strict overlap checks because `jsonwebtoken`'s return type is `string | JwtPayload`.
- **Detection**: `tsc --noEmit` reported `TS2352`.
- **Fix**: Updated cast via `unknown` (`as unknown as { sub: number; ... }`) with explicit active-user DB lookup verification on line 412 of `server/app.ts`.
- **Verification**: Verified via `npm run lint` and `tests/api.test.ts` authentication tests.

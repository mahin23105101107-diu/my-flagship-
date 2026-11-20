# ADR-004: Production Peer-Approval Gate & Self-Approval Prevention

## Context
Unreviewed changes to Production feature flags can trigger widespread outages. Course requirement FR7 mandates versioned changes, before/after diffs, role-based access (`VIEWER`, `EDITOR`, `APPROVER`, `ADMIN`), production approval gating, and strict prevention of self-approval.

## Problem
How should Production configuration mutations be governed without blocking emergency incident kill switches?

## Options Considered
1. **Admin-only Production Edits**: Prevents `EDITOR` developers from proposing production rollouts, creating operational bottlenecks.
2. **Change Request Workflow with Peer Approval + Separate Emergency Kill Switch**: Any `EDITOR`+ can propose a Production change (`202 Pending Approval`), stored as `before_snapshot_json` and `after_snapshot_json`. A distinct `APPROVER` or `ADMIN` (`approver_id != author_id`) must approve before applying and broadcasting via SSE. Emergency kill switches remain directly executable by `APPROVER`/`ADMIN` with full audit logging.

## Decision
Implement **Change Requests with mandatory peer approval (`approver_id != author_id`)** for Production environments (`require_approval = true`), returning RFC 9457 `403 Self-Approval Forbidden` if an author tries to approve their own request.

## Consequences
- Verified in `tests/api.test.ts` and `ApprovalAndRolloutIntegrationTest.java`: Production state remains untouched until peer approval succeeds, and self-approval attempts deterministically return HTTP `403`.

# FlagShip 15-Minute Live Defence Guide (Requirement C12)

## Agenda & Timing

| Minute | Topic | Screen / Action | Talking Points |
|--------|-------|-----------------|----------------|
| 0:00–2:00 | **Problem & C4 Architecture** | `README.md` + `docs/architecture.md` | Modular Monolith vs. Microservices (ADR-001); shared deterministic kernel (`flagship-shared`); 20-table relational model. |
| 2:00–4:30 | **Login & RBAC Overview** | Login Page -> Dashboard Overview | Sign in as `editor@flagship.dev`. Show live KPIs, Production Rollout Activity chart, and recent audit trail. |
| 4:30–7:00 | **Flag Types & Composite Targeting** | Feature Flags -> Flag Details -> Targeting Rules | Show `BOOLEAN`, `STRING`, `NUMBER`, `JSON` flags. Run **Live Evaluation Preview** showing 5-stage Chain of Responsibility (`Kill Switch -> Targets -> Rules -> Rollout -> Default`) and sub-50µs timing. |
| 7:00–9:30 | **Production Peer Approval & Self-Approval Block** | Rollout Management -> Approval Center | As `editor@flagship.dev`, submit a Production rollout expansion (`50%`). Note Production stays unchanged (`202 Pending Approval`). Sign in as `approver@flagship.dev` (Marcus), demonstrate a self-authored CR gets `403 Self-Approval Forbidden`, then approve Elena's CR and watch SSE update live. |
| 9:30–11:30 | **Live SSE & Offline Outage Resilience** | SDK Setup -> Offline Simulator | Show SSE connected indicator, click **Simulate Server Offline**, evaluate flags from local snapshot (`LOCAL_DISK_SNAPSHOT`) with zero errors. Also show `flagship-sample-app` `@FeatureFlag` code. |
| 11:30–13:30 | **Experiment Analytics & Flag Hygiene** | Experiment Analytics -> Flag Hygiene | Compare `new-checkout` (balanced, significant lift) vs `homepage-layout` (SRM detected via Chi-Square). Ingest batch events live. Show stale flags in Flag Hygiene (`>= 30d` unused, `>= 14d` at 100%). |
| 13:30–15:00 | **Evidence & Q&A** | `docs/performance-report.md` | Present actual measured `p99 = 8.03 µs`, `50-client SSE p95 = 48.53 ms`, and `1,000,000-user` rollout `0` cohort violations. |

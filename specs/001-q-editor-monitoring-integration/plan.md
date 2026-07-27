# Implementation Plan: Q-Editor Production Monitoring Integration

**Branch**: `001-q-editor-monitoring-integration` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-q-editor-monitoring-integration/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Wire the existing, unintegrated `packages/tracking-sdk` into `app/q-editor` so that unhandled JS
errors, editor performance timings (load/save), and page-view/unique-visitor activity are
automatically captured and shipped to the already-built backend ingestion pipeline
(`app/q-server` tracking-ingest → RabbitMQ → ClickHouse) and made visible through the existing
`tracking-analytics` admin endpoints. The SDK and backend schemas currently have no concept of
deployment environment, so this feature also adds an `environment` tag (production / staging /
development) end-to-end — from SDK payload, through ingest validation, to an analytics filter —
so non-production noise can be excluded from production dashboards per the resolved
clarifications. No new infrastructure, dashboard UI, alerting, or operational kill-switch is
built; this is an additive integration of existing building blocks.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict) across `app/q-editor`, `packages/tracking-sdk`, and
`app/q-server`; Node ≥22.17 runtime for `q-server`.

**Primary Dependencies**: `monorepo-tracking-sdk` (workspace package, `packages/tracking-sdk`) as
the instrumentation library; Vue 3.5 Composition API in `app/q-editor` (integration point in
`main.ts` / qiankun lifecycle); Fastify + Zod in `app/q-server`'s existing
`tracking-ingest`/`tracking-analytics` modules (schema extension only, no new modules).

**Storage**: N/A for `q-editor` (client-side instrumentation only). No new storage — reuses the
existing ClickHouse `tracking_events` table and RabbitMQ transport already operated by `q-server`;
only an additive `environment` column/field is introduced into the existing pipeline.

**Testing**: Vitest for both `app/q-editor` (new integration composable/plugin) and
`packages/tracking-sdk` (first unit tests for this package — it currently has zero test
coverage); Vitest for `app/q-server` schema/service changes under `src/spec/tracking/`.

**Target Platform**: Browser (evergreen Chrome/Edge/Firefox/Safari), running both as a qiankun
sub-app (embedded in `app/frontend`) and standalone (direct `q-editor` deployment) — both modes
must instrument identically per FR-004.

**Project Type**: Web application feature — frontend SDK integration plus a small, additive
backend schema/query extension. No new services.

**Performance Goals**: No more than 100ms of added latency attributable to monitoring on editor
load/save actions (SC-004); reuse the SDK's existing batching (50 events / 10s flush interval) —
no new performance target is introduced.

**Constraints**: MUST NOT alter or block the editor's existing autosave/save critical path
(FR-005, FR-008); MUST NOT bypass the backend's existing `app_id` whitelist or rate limits
(60 req/s single, 30 req/s batch); the new `environment` field MUST be additive/backward
compatible with the existing `trackEventSchema` (existing non-q-editor producers must not break).

**Scale/Scope**: Single consuming app (`q-editor`) instrumented via a shared SDK also usable by
other apps in the future; backend change is limited to the existing `tracking-ingest` and
`tracking-analytics` modules — no new microservice, queue, or database.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                               | Assessment                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Monorepo Module Boundary Integrity                   | PASS — `q-editor` consumes tracking capability only via the shared `packages/tracking-sdk` workspace package (no cross-app relative imports); `q-editor` still talks to `q-server` only over its public HTTP ingest contract.                                                                                                |
| II. Strict Type Safety & Schema-First Validation        | PASS — the new `environment` field is added as a typed enum in both the SDK's TypeScript types and `q-server`'s Zod `trackEventSchema`/`trackBatchSchema`; no `any` introduced; validated at the trust boundary (ingest route) before use.                                                                                   |
| III. Unified API Contract & Response Envelope           | N/A / PASS — ingest endpoints are fire-and-forget (`204 No Content`), consistent with their existing convention; no new endpoint changes this. `tracking-analytics` responses already use the canonical `{code, msg, data}` envelope and are unaffected by adding an optional filter param.                                  |
| IV. Security-by-Default                                 | PASS — `environment` is constrained to a fixed enum (`production\|staging\|development`) at the schema layer to prevent arbitrary client-supplied values; no new secrets; existing rate limiting and `app_id` whitelist are preserved unchanged; no PII added to payloads (consistent with FR-007).                          |
| V. Test-First / Test-Adequate Delivery                  | PASS (with remediation) — new logic (environment resolution/tagging in the SDK, the q-editor integration plugin, and the backend schema/filter changes) ships with unit tests in this feature; this is also the first test coverage added to `packages/tracking-sdk`, closing a pre-existing gap rather than compounding it. |
| VI. Observability & Structured Logging                  | PASS — this feature _is_ the observability capability; it must preserve, not regress, the existing ClickHouse-consumer fallback-to-local-JSONL and dedup logic (untouched by this change).                                                                                                                                   |
| VII. Code Style & Static Analysis Compliance            | PASS — all changed files (TS/Vue in `q-editor`, TS in `tracking-sdk`, TS in `q-server`) go through the standard root ESLint/Prettier/cspell gate; no competing lint config introduced.                                                                                                                                       |
| VIII. Micro-Frontend & Cross-App Integration Discipline | PASS — tracking initialization must be wired into both the standalone `main.ts` bootstrap and the qiankun `mount`/`unmount` lifecycle hooks so behavior is identical in both modes (FR-004); router-base/public-path handling is untouched.                                                                                  |
| IX. AI/LLM Integration Governance                       | N/A — feature has no LLM/AI surface.                                                                                                                                                                                                                                                                                         |
| X. Performance & Data Pipeline Integrity                | PASS — `environment` is a low-cardinality enum suitable as an additional ClickHouse filter dimension without breaking existing date-partition-pruning discipline; SDK batching (not per-event sync writes) is preserved; analytics caching TTLs on existing endpoints are unaffected since the filter is additive.           |

**Result**: No violations. Complexity Tracking table below is not required.

**Post-Phase-1 re-check**: `data-model.md` and `contracts/` confirm the only schema change is one
additive, enum-constrained, low-cardinality field (`environment`) plus one optional query filter
with a safe default (`production`) — no new violations introduced by the detailed design. Gate
remains PASS.

## Project Structure

### Documentation (this feature)

```text
specs/001-q-editor-monitoring-integration/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/tracking-sdk/
├── src/
│   ├── core/tracker.ts                  # MODIFIED: accept/attach `environment` on every event
│   ├── types.ts                         # MODIFIED: add `Environment` enum/type to config + event payload
│   └── __tests__/tracker.spec.ts        # NEW: first unit tests for this package (environment tagging, existing collectors)

app/q-editor/
├── src/
│   ├── plugins/tracking.ts              # NEW: creates/configures the Tracker instance, resolves environment from build env
│   ├── main.ts                          # MODIFIED: initialize tracking on standalone bootstrap
│   ├── public-path.ts                   # (reference only, unchanged) qiankun public-path resolution consumed by tracking init timing
│   └── plugins/__tests__/tracking.spec.ts  # NEW: unit tests for the integration plugin
(qiankun lifecycle hooks in main.ts)      # MODIFIED: call tracking init in `mount()`, flush/teardown in `unmount()`

app/q-server/
├── src/modules/tracking/tracking-ingest/
│   ├── tracking-ingest.schemas.ts       # MODIFIED: add `environment` enum field to trackEventSchema/trackBatchSchema
│   └── tracking-ingest.constants.ts     # MODIFIED (if needed): confirm/register `q-editor` in TRACKING_APP_IDS
├── src/modules/tracking/tracking-analytics/
│   ├── tracking-analytics.schemas.ts    # MODIFIED: add optional `environment` query filter (default: production)
│   └── tracking-analytics.service.ts    # MODIFIED: apply environment filter to ClickHouse queries
└── src/spec/tracking/
    ├── tracking-ingest.spec.ts          # MODIFIED/NEW: tests for environment field validation
    └── tracking-analytics.spec.ts       # MODIFIED/NEW: tests for environment filter behavior
```

**Structure Decision**: This is an additive integration across three existing packages in the
pnpm workspace — no new app, service, or top-level directory is created. Changes are scoped to:
(1) `packages/tracking-sdk` for the shared SDK's environment-tagging capability and its first test
suite, (2) `app/q-editor` for the actual instrumentation wiring (standalone + qiankun lifecycle),
and (3) `app/q-server`'s existing `tracking-ingest`/`tracking-analytics` modules for the matching
schema and query-filter extension. This mirrors Constitution Principle I (shared code lives in the
workspace package; app-specific wiring lives in the consuming app; backend logic stays in
`q-server`).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No entries — the Constitution Check above recorded no violations.

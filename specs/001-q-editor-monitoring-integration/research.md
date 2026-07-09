# Phase 0 Research: Q-Editor Production Monitoring Integration

All unknowns from the Technical Context have been resolved through direct inspection of
`packages/tracking-sdk` and `app/q-server/src/modules/tracking/*`. No `NEEDS CLARIFICATION`
markers remain.

## 1. Instrumentation approach: reuse existing SDK vs. build new

- **Decision**: Use the existing `monorepo-tracking-sdk` (`packages/tracking-sdk`, exposing a
  `Tracker` class) as the sole instrumentation library for `q-editor`. No new tracking library is
  introduced.
- **Rationale**: The SDK already implements everything FR-001/002/003/005/008 require:
  `ErrorCollector` (JS errors, unhandled rejections, resource failures, Vue errors),
  `PerformanceCollector` (Web Vitals/timings), `PageViewCollector`, batching (50 events / 10s
  flush), retry with exponential backoff, and `sendBeacon`/`fetch keepalive`/image-beacon
  fallback transport. Building a second implementation would violate Constitution Principle I
  (shared utilities MUST be extracted/reused via workspace packages, not duplicated).
- **Alternatives considered**:
  - _Build a q-editor-specific tracker_: rejected — duplicates ~work already done in the SDK and
    fragments future maintenance across apps.
  - _Adopt a third-party SaaS APM (e.g., Sentry)_: rejected — data must land in the existing
    ClickHouse pipeline that `tracking-analytics` already queries; introducing a second data
    store/dashboard would fragment monitoring and isn't justified by this feature's scope.

## 2. Environment tagging: where it's added and who sets it

- **Decision**: Add an `environment` enum field (`production | staging | development`) to (a) the
  SDK's `Tracker` config/event payload types and (b) `q-server`'s `trackEventSchema` /
  `trackBatchSchema` (Zod). The SDK resolves the value at initialization time from a build-time
  environment variable already available via Vite (e.g. `import.meta.env.MODE` or a dedicated
  `VITE_APP_ENV`), and it is validated as a closed enum at the ingest trust boundary.
- **Rationale**: Neither the SDK nor the backend schema currently has any environment concept
  (verified by direct code inspection) — this is a genuine gap, not a design choice to avoid.
  Client-declared, schema-validated metadata is already the existing pattern for comparable fields
  (`sdk_version`, `page_url`, `client_env`), so this follows established precedent rather than
  introducing a new trust model. Constraining it to a fixed enum at the Zod layer prevents
  arbitrary/spoofed values (Constitution Principle IV).
- **Alternatives considered**:
  - _Infer environment server-side purely from request origin/hostname_: rejected as the sole
    source — brittle across custom domains, internal proxies, and local dev tunneling; may still
    be worth a defense-in-depth cross-check, deferred to the tasks phase as a nice-to-have, not a
    blocking design requirement.

## 3. Dashboard visibility: extend existing analytics vs. build new

- **Decision**: Add an optional `environment` query filter (default `production`) to the existing
  `tracking-analytics` endpoints (`/analytics/overview`, `/trend`, `/errors`, `/performance`,
  `/funnel`, `/events`) rather than building any new dashboard or view.
- **Rationale**: FR-006 (aggregated visibility) and FR-011 (dashboard-only "full control", no
  kill-switch/alerting) are already satisfiable by the existing admin analytics surface once it
  can filter by environment; this keeps the feature purely additive and avoids duplicating a
  generalized capability that already exists and is shared across apps.
- **Alternatives considered**:
  - _New q-editor-specific analytics dashboard_: rejected — unnecessary duplication; the existing
    `tracking-analytics` module is already app-agnostic (accepts `app_id` filters) and is the
    established place for this kind of stakeholder-facing aggregation.

## 4. Prerequisite: `app_id` whitelist registration

- **Decision**: Verify, and if absent register, a `q-editor` (or equivalent existing constant)
  entry in the backend's `TRACKING_APP_IDS` whitelist as a Foundational task before any other
  work in this feature, since `tracking-ingest`'s schema rejects any event whose `app_id` isn't
  in that whitelist.
- **Rationale**: This is a hard prerequisite, not a design choice — without it, 100% of events
  from the new integration would fail validation at the ingest boundary.
- **Alternatives considered**: None — this is a required, blocking step.

## 5. Offline/failure resilience: reuse SDK's best-effort transport, no new persistence layer

- **Decision**: Rely on the SDK's existing in-memory queue (max 200 events, drops oldest on
  overflow), retry/backoff, and `sendBeacon`-on-unload behavior. Do not add a persistent
  (e.g., IndexedDB-backed) offline queue to the SDK as part of this feature.
- **Rationale**: FR-008 requires that the user's _editing_ work isn't lost or corrupted by a
  monitoring-backend outage — that guarantee is already provided by `q-editor`'s existing,
  separate Dexie-based local draft storage and is unaffected by tracking delivery success/failure.
  The feature's own success criteria (SC-001/SC-002: 95%/99% visibility, not 100%) tolerate
  best-effort delivery under network partition, so the existing transport is sufficient. Adding
  persistent tracking-event durability to the shared SDK is a larger, cross-cutting change
  disproportionate to this feature's scope and would benefit from being evaluated independently
  for all SDK consumers, not just `q-editor`.
- **Alternatives considered**:
  - _Add an IndexedDB-backed offline queue to the SDK_: rejected for this feature as scope
    creep; noted as a candidate follow-up enhancement to the shared SDK.

## 6. Test coverage strategy

- **Decision**: Add unit tests (Vitest) for: the SDK's new environment-resolution/tagging logic
  (`packages/tracking-sdk/src/__tests__/tracker.spec.ts` — the package's first tests), the new
  `q-editor` integration plugin (`app/q-editor/src/plugins/__tests__/tracking.spec.ts`), and the
  backend schema/query-filter changes (`app/q-server/src/spec/tracking/*.spec.ts`).
- **Rationale**: Constitution Principle V requires new business logic ship with tests in the same
  PR. `packages/tracking-sdk` currently has zero test coverage; since this feature is the first to
  modify it, it is the natural point to establish baseline coverage rather than compounding the
  existing gap.
- **Alternatives considered**:
  - _Only test the q-editor integration point, skip SDK-level tests_: rejected — leaves the
    shared package's new, reusable logic unverified for future consumers.

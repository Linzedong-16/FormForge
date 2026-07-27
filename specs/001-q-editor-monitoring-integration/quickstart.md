# Quickstart: Validating Q-Editor Production Monitoring Integration

This guide validates that the feature works end-to-end, once implemented. It does not contain
implementation code — see `contracts/` for the request/response shapes and `data-model.md` for
the event schema this exercises.

## Prerequisites

- Local monorepo running via `pnpm dev:micro` (or at minimum `pnpm dev:editor` plus the
  `q-server` API running with its Redis/RabbitMQ/ClickHouse dependencies available).
- `q-server` build includes the extended `trackEventSchema`/`trackBatchSchema` (with
  `environment`) and the extended `tracking-analytics` query filters (Phase 2 tasks).
- `app/q-editor` build includes the new `plugins/tracking.ts` integration wired into both
  `main.ts` (standalone) and the qiankun `mount()`/`unmount()` lifecycle.
- `packages/tracking-sdk` is built with the `environment`-aware `Tracker`.
- An admin account with `super_admin` role for querying `tracking-analytics`.

## Scenario 1 — JS error visibility (User Story 1 / FR-001, SC-001)

1. Open `q-editor` standalone (`pnpm dev:editor`) in a browser.
2. Trigger a JS error from the browser devtools console while the editor is loaded, e.g.:
   `window.dispatchEvent(new ErrorEvent('error', { message: 'quickstart-test-error' }))`
3. Confirm (via network tab or server logs) a `POST /api/v1/track` request is sent with
   `event_category: "error"`, `app_id` set to the editor's registered id, and
   `environment: "development"` (or whatever `VITE_APP_ENV`/`import.meta.env.MODE` resolves to
   locally).
4. As a `super_admin`, call `GET /api/admin/analytics/errors?range=1h&environment=development`
   and confirm the triggered error appears in the results within ~1 minute.
5. **Expected outcome**: the error is visible without any manual report — validates FR-001 and
   the intent of SC-001 (production timing target is validated separately in a staging/prod
   soak test, not required for this quickstart).

## Scenario 2 — Editor performance timing (User Story 2 / FR-002)

1. In `q-editor`, open an existing questionnaire for editing.
2. Make an edit and save it.
3. Confirm two batched events are eventually flushed (within the SDK's 10s flush interval) to
   `POST /api/v1/track/batch` with `event_category: "perf"`, one for load and one for save, each
   carrying a duration and outcome in `properties`.
4. As a `super_admin`, call
   `GET /api/admin/analytics/performance?range=1h&metric=load&environment=development` (and
   again with `metric=save`) and confirm timing data appears.
5. **Expected outcome**: both load and save timings are recorded and queryable — validates
   FR-002.

## Scenario 3 — PV/UV counting (User Story 3 / FR-003)

1. Open `q-editor` from two different browser profiles/incognito sessions (simulating two
   distinct visitors), and open it twice from one of them (simulating a repeat page view).
2. Confirm `page_view` events (category `behavior`) are sent for each open, each carrying a
   stable `anonymous_id` per browser profile/session.
3. As a `super_admin`, call
   `GET /api/admin/analytics/trend?metric=pv&granularity=hour&range=1h&environment=development`
   and the equivalent with `metric=uv`.
4. **Expected outcome**: PV count reflects 3 total opens; UV count reflects 2 distinct visitors —
   validates FR-003 and User Story 3's acceptance scenarios.

## Scenario 4 — Environment tagging & production-default filtering (FR-009, FR-012)

1. Repeat Scenario 1 against a staging deployment of `q-editor` (or by manually overriding the
   build-time environment variable to `staging` in a local build).
2. Confirm the resulting event carries `environment: "staging"`.
3. Call `GET /api/admin/analytics/errors?range=1h` **without** an `environment` param and confirm
   the staging-origin error is **excluded** (default filter is `production`).
4. Call the same endpoint with `environment=staging` explicitly and confirm the event **is**
   included.
5. **Expected outcome**: production dashboards stay clean by default while staging/dev data
   remains queryable on demand — validates the resolved clarification behind FR-012.

## Scenario 5 — No blocking / no data loss on backend outage (FR-005, FR-008)

1. Stop the local `q-server` process (or block network access to it) while `q-editor` is open.
2. Continue editing and saving a questionnaire in `q-editor`.
3. **Expected outcome**: editing and saving continue to work normally (backed by `q-editor`'s
   existing local draft storage) with no user-visible errors or hangs attributable to the
   tracking calls failing — validates FR-005 and FR-008. Restoring `q-server` and waiting for the
   SDK's retry/flush should surface at least some of the queued events, though 100% delivery is
   not required (best-effort, per `research.md` §5).

## Out of scope for this quickstart

- Verifying proactive alerting — explicitly out of scope for this feature (resolved
  clarification: passive dashboards only).
- Verifying a remote kill-switch or dynamic sampling-rate control — explicitly out of scope
  (resolved clarification: dashboard visibility only).

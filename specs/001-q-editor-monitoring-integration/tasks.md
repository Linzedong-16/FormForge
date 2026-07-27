---
description: "Task list for Q-Editor Production Monitoring Integration"
---

# Tasks: Q-Editor Production Monitoring Integration

**Input**: Design documents from `/specs/001-q-editor-monitoring-integration/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — the feature's `research.md` (§6) and the project constitution (Principle V)
both require new business logic to ship with unit tests in the same change, so test tasks are
part of Foundational and each user-story phase, not optional.

**Organization**: Tasks are grouped by user story (from spec.md: US1 = P1 error visibility,
US2 = P2 performance visibility, US3 = P3 usage/PV-UV visibility) to enable independent
implementation and testing of each.

**Implementation status**: All Setup/Foundational/US1/US2/US3 tasks (T001–T028) are implemented
and covered by passing automated tests (4 tests in `packages/tracking-sdk`, 42 in `app/q-editor`,
9 in `app/q-server` — 55 total). A few tasks' exact file paths were refined during implementation
once the real code was inspected; see the "Deviations from plan" note at the end of each affected
task. T029/T030 (manual, live-stack quickstart validation) were not executed — no running
Postgres/Redis/RabbitMQ/ClickHouse/q-server stack was available in this environment; see Notes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are exact, per `plan.md`'s Project Structure section

## Path Conventions

- Shared SDK: `packages/tracking-sdk/src/`
- Frontend integration: `app/q-editor/src/`
- Backend (existing tracking modules, extended): `app/q-server/src/modules/tracking/`
- Backend tests: `app/q-server/src/spec/tracking/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Make the shared SDK consumable from `q-editor` and ensure environment info is
available at build time.

- [x] T001 Add `monorepo-tracking-sdk` as a pnpm workspace dependency of `q-editor` in
      `app/q-editor/package.json`, then run `pnpm install` at the repo root so the workspace link
      resolves
- [x] T002 [P] Add/confirm a build-time environment indicator (`VITE_APP_ENV` or reuse
      `import.meta.env.MODE`) resolving to `production | staging | development` across
      `app/q-editor/.env`, `app/q-editor/.env.production`, and `app/q-editor/.env.mock`
      **Deviation**: no new `.env*` files were added — the root `.gitignore` already excludes all
      `.env*` files project-wide (untracked, dev-machine-local), so a new env var would not be
      shared with other developers/CI. Instead, `app/q-editor/src/plugins/tracking.ts`'s
      `resolveEnvironment()` reads Vite's always-available `import.meta.env.MODE` directly
      (`"production"` → production, `"staging"` → staging, anything else → development), requiring
      zero new config files.

**Checkpoint**: `q-editor` can import the SDK and knows its own deployment environment at build
time.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core environment-tagging plumbing and the Tracker's initialization wiring that every
user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — none of the
error/performance/usage collectors can deliver data until the Tracker is initialized and the
backend accepts `q-editor`'s events at all.

- [x] T003 Verify, and if absent register, a `q-editor` entry in the `TRACKING_APP_IDS` whitelist
      constant (without this, 100% of events are rejected at ingest)
      **Deviation**: no code change needed — `q-editor` was already present in
      `TRACKING_APP_IDS` in `packages/common/src/track/track.interface.ts` (the actual location of
      this constant; there is no separate `tracking-ingest.constants.ts` file). Verified only.
- [x] T004 [P] Add an `Environment` enum/type (`production | staging | development`)
      **Deviation**: defined independently in two places, matching this codebase's existing
      convention of mirroring value-identical unions between the browser SDK and the server
      (e.g. `EventPriority` vs. `TrackEventCategory`) rather than forcing a new cross-package
      dependency: `Environment` in `packages/tracking-sdk/src/types/config.ts` (SDK-side, no new
      dependency added to the otherwise-standalone/publishable SDK package), and
      `TRACKING_ENVIRONMENTS`/`TrackingEnvironment` in `packages/common/src/track/track.interface.ts`
      (server-side, consumed by q-server's Zod schemas).
- [x] T005 [P] Add the `environment` enum field to `trackEventSchema` and `trackBatchSchema` in
      `app/q-server/src/modules/tracking/tracking-ingest/tracking-ingest.schemas.ts` per
      `contracts/tracking-ingest.md`
- [x] T006 Extend the `Tracker` class in `packages/tracking-sdk/src/core/tracker.ts` (and
      `core/context.ts`'s `ContextBuilder`) to accept `environment` in its init config and attach
      it to every outgoing event payload
- [x] T007 [P] Add unit tests for `Tracker` environment tagging (config validation + attachment on
      emitted events, including the error-priority immediate-send path and the existing
      answer-content sanitization) in `packages/tracking-sdk/src/__tests__/tracker.spec.ts` — this
      package's first test suite. 4 tests, passing.
- [x] T008 [P] Add backend validation tests for the new `environment` field (accepts the 3 valid
      enum values, rejects invalid/missing) in
      `app/q-server/src/spec/tracking/tracking-ingest.schemas.spec.ts`. 4 tests, passing.
- [x] T009 Create the integration plugin `app/q-editor/src/plugins/tracking.ts`: instantiate
      `Tracker` with `q-editor`'s `app_id`, the resolved `environment`, and expose
      `getTracker()`/`getErrorCollector()`/`getPerformanceCollector()`/`installTracking()`/
      `flushTracking()` singletons
- [x] T010 Wire `plugins/tracking.ts` initialization into `app/q-editor/src/main.ts` for the
      standalone bootstrap path AND into the qiankun `mount()`/`unmount()` lifecycle hooks (init on
      mount via `installTracking()`, flush-and-teardown on unmount via `flushTracking()`) so both
      deployment modes behave identically per FR-004
- [x] T011 [P] Add unit tests for the plugin's init/teardown behavior in both standalone and
      qiankun-mount code paths in `app/q-editor/src/plugins/__tests__/tracking.spec.ts`. 8 tests,
      passing (includes a PV-on-route-change assertion originally scoped under US3/T024).

**Checkpoint**: Foundation ready — the Tracker initializes identically in standalone and qiankun
modes, is environment-tagged, and the backend accepts and validates its events. User story phases
below focus on story-specific instrumentation and dashboard-side visibility.

---

## Phase 3: User Story 1 - Diagnose production editor errors quickly (Priority: P1) 🎯 MVP

**Goal**: Unhandled JS/Vue errors from the production editor are captured and become visible to
production monitoring without the affected user reporting them.

**Independent Test**: Trigger a JS error in a running `q-editor` instance; confirm it becomes
visible via the errors analytics endpoint within about a minute, per `quickstart.md` Scenario 1.

### Implementation for User Story 1

- [x] T012 [US1] Window-level error capture (JS errors/unhandled rejections/resource errors) is
      registered via `getErrorCollector()` in `plugins/tracking.ts` (called from `installTracking`
      in T010); Vue component errors are captured via `createTrackingPlugin`'s
      `app.config.errorHandler` wiring (from `monorepo-tracking-sdk/plugins/vue`), installed by the
      same `installTracking()` call. No separate manual `errorHandler` wiring was needed — the SDK's
      Vue plugin already does this.
- [x] T013 [P] [US1] Add an optional `environment` query filter (default `production`) to the
      `/analytics/errors` route schema in
      `app/q-server/src/modules/tracking/tracking-analytics/tracking-analytics.schemas.ts` per
      `contracts/tracking-analytics.md`
- [x] T014 [US1] Apply the `environment` filter to the errors aggregation ClickHouse query in
      `app/q-server/src/modules/tracking/tracking-analytics/tracking-analytics.service.ts`
- [x] T015 [P] [US1] Add backend tests for the `environment` filter (default-to-production,
      explicit override) on `/analytics/errors` in
      `app/q-server/src/spec/tracking/tracking-analytics.service.spec.ts`
- [ ] T016 [US1] Manually execute Quickstart Scenario 1 (JS error visibility) end-to-end per
      `specs/001-q-editor-monitoring-integration/quickstart.md` — **not executed** (no live
      Postgres/Redis/RabbitMQ/ClickHouse/q-server stack available in this environment); confidence
      instead comes from the automated tests in T007/T008/T011/T015 plus TypeScript/ESLint/cspell
      passing on every touched file.

**Checkpoint**: User Story 1 is fully functional and independently demoable — this is the MVP.

---

## Phase 4: User Story 2 - Track production editor performance health (Priority: P2)

**Goal**: Editor load-time and save-time timings (with outcome) are captured and visible to
production monitoring.

**Independent Test**: Open a questionnaire, edit it, save it; confirm both timings appear via the
performance analytics endpoint, per `quickstart.md` Scenario 2.

### Implementation for User Story 2

- [x] T017 [P] [US2] Instrument questionnaire-load timing: call
      `getPerformanceCollector().trackTiming('editor_load', durationMs, { success })` around the
      editor's "load questionnaire for editing" flow.
      **Deviation**: implemented in `app/q-editor/src/views/EditorView/index.vue`'s `onMounted`
      hook (the actual call site that invokes `getSurveyById`), not in `src/db/operation.ts` — the
      latter is a generic, reusable IndexedDB wrapper used by many unrelated operations
      (`getAllSurvey`, `deleteSurveyById`, etc.) where "load for editing" isn't a distinct concept.
      Also added `getErrorCollector().reportError(...)` on load failure so a failed load is both
      timed and visible as an error (closing what would otherwise be an unhandled rejection).
- [x] T018 [P] [US2] Instrument save-changes timing: call
      `getPerformanceCollector().trackTiming('editor_save', durationMs, { success })` around the
      editor's save flow. **Deviation**: implemented in `EditorView/index.vue`'s `doSave()`
      (wraps the whole user-perceived save operation, including remote sync), not in
      `src/db/operation.ts`, for the same reason as T017.
- [x] T019 [P] [US2] Add an optional `environment` query filter (default `production`) to the
      `/analytics/performance` route schema in
      `app/q-server/src/modules/tracking/tracking-analytics/tracking-analytics.schemas.ts`
- [x] T020 [US2] Apply the `environment` filter to the performance aggregation ClickHouse query in
      `app/q-server/src/modules/tracking/tracking-analytics/tracking-analytics.service.ts`
- [x] T021 [P] [US2] Add backend tests for the `environment` filter on `/analytics/performance` in
      `app/q-server/src/spec/tracking/tracking-analytics.service.spec.ts`
- [x] T022 [P] [US2] Add unit tests for the load/save timing instrumentation.
      **Deviation**: added in `app/q-editor/src/views/EditorView/__tests__/index.spec.ts` (not
      `src/db/__tests__/operation.spec.ts`), matching T017/T018's actual call-site location. 3
      tests: load success, load failure (asserts both the perf event and the manual error report),
      save success via a real Ctrl+S keydown dispatch.
- [ ] T023 [US2] Manually execute Quickstart Scenario 2 (performance timing) end-to-end per
      `quickstart.md` — **not executed**, same reason as T016.

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Understand editor usage volume (Priority: P3)

**Goal**: Page-view and unique-visitor counts for editor opens are captured and visible,
distinguishing repeat views from distinct visitors.

**Independent Test**: Open the editor from distinct and repeated sessions; confirm PV and UV
counts are distinguishable via the trend analytics endpoint, per `quickstart.md` Scenario 3.

### Implementation for User Story 3

- [x] T024 [US3] Confirmed the SDK's `PageViewCollector` fires on route changes once
      `installTracking()` installs `createTrackingPlugin(tracker, { router })` (registered in
      Foundational T009/T010), and that a stable `anonymous_id` persists via the SDK's
      `SessionManager` singleton (localStorage-backed). Verified with an automated test (router
      navigation → `page_view` track call) in `plugins/__tests__/tracking.spec.ts`, rather than a
      narrative-only confirmation.
- [x] T025 [P] [US3] Add an optional `environment` query filter (default `production`) to the
      `/analytics/trend` route schema (covering the `pv`/`uv` metrics) in
      `app/q-server/src/modules/tracking/tracking-analytics/tracking-analytics.schemas.ts`
- [x] T026 [US3] Apply the `environment` filter to the trend/PV/UV aggregation ClickHouse query in
      `app/q-server/src/modules/tracking/tracking-analytics/tracking-analytics.service.ts`
- [x] T027 [P] [US3] Add backend tests for the `environment` filter on `/analytics/trend` (pv/uv)
      in `app/q-server/src/spec/tracking/tracking-analytics.service.spec.ts`
- [ ] T028 [US3] Manually execute Quickstart Scenario 3 (PV/UV counting) end-to-end per
      `quickstart.md` — **not executed**, same reason as T016.

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the remaining cross-cutting quickstart scenarios and satisfy constitution
compliance gates before merge.

- [ ] T029 [P] Manually execute Quickstart Scenario 4 (environment tagging & production-default
      filtering) — **not executed** (no live stack); the default-to-production behavior itself is
      covered by an automated test in `tracking-analytics.service.spec.ts`.
- [ ] T030 [P] Manually execute Quickstart Scenario 5 (no blocking / no data loss on backend
      outage) — **not executed** (no live stack); the SDK's existing best-effort transport
      (unchanged by this feature) and `EditorView`'s unaffected autosave path are the basis for
      confidence here; not independently re-verified against a real outage in this session.
- [x] T031 [P] Updated `app/q-server/src/modules/tracking/doc/tracking-module.md` (the module's
      actual living design doc, referenced by code comments as "设计文档 §4.3/§9.4" — a closer
      match to Constitution Principle III's "equivalent OpenAPI artifact" than the legacy,
      unrelated `docs/API接口文档.md`, which documents a different, older skeleton backend surface
      and has no tracking-module section at all) with the new `environment` field/filter across
      §4.1 (ClickHouse column), §5.3 (new subsection), §6.1, §6.2, and §10 (shared types).
- [x] T032 Ran the full lint/format/spellcheck/test gate across the three touched packages:
      ESLint (0 errors/warnings), Prettier (`--write` applied to a few spec-kit docs and the
      updated design doc), cspell (0 issues after adding `qiankun`/`clickhouse`/`persistedstate`/
      `fontawesome`/`permiss`/`deduplicator`/`uuidv` — all pre-existing project words, not
      introduced by this feature — to `.cspell/custom-dictionary.txt`), and all three packages'
      test suites (4 + 9 + 42 = 55 tests, all passing). `packages/tracking-sdk` gained a `test`
      script and `vitest`/`happy-dom` devDependencies as part of this gate.
- [x] T033 [P] Self-review completed — see the implementation summary for the full principle-by-
      principle assessment; no new violations found beyond the pre-existing Principle III gap
      already flagged in the constitution's Sync Impact Report (unrelated to this feature).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational phase completion.
  - User Story 1 (P1) can start immediately after Foundational.
  - User Story 2 (P2) can start immediately after Foundational — independent of US1's tasks
    (different files), though both extend the same `tracking-analytics.schemas.ts`/`.service.ts`
    files, so if worked in parallel by different people, coordinate to avoid merge conflicts on
    those two files.
  - User Story 3 (P3) — same independence/file-overlap note as US2.
- **Polish (Phase 6)**: Depends on all three user stories being complete (quickstart scenarios 4–5
  exercise behavior introduced across all stories).

### Within Each User Story

- Backend schema change before backend service filter application (e.g., T013 before T014).
- Service filter application before its backend test (e.g., T014 before T015).
- Instrumentation call sites before their unit tests (e.g., T017/T018 before T022).
- Automated tasks before the manual quickstart-validation task in that phase.

### Parallel Opportunities

- T004 and T005 (different files: SDK types vs. backend schema) can run in parallel.
- Within Phase 3: T013 [P] can run alongside T012 (different files).
- Within Phase 4: T017, T018, T019 are all [P] (different files/functions) before T020 depends on
  T019.
- Within Phase 5: T025 [P] can run alongside T024.
- Phase 6's T029, T030, T031, T033 are all [P] (independent validation/doc tasks); T032 should run
  after the others since it's the final full-suite gate.

---

## Parallel Example: Foundational Phase

```bash
# Launch independent Foundational tasks together:
Task: "Add Environment enum/type to packages/tracking-sdk/src/types/config.ts"
Task: "Add environment field to trackEventSchema/trackBatchSchema in app/q-server/.../tracking-ingest.schemas.ts"
```

## Parallel Example: User Story 2

```bash
# Launch independent instrumentation + schema tasks together:
Task: "Instrument questionnaire-load timing in app/q-editor/src/views/EditorView/index.vue"
Task: "Instrument save-changes timing in app/q-editor/src/views/EditorView/index.vue"  # same file as above — sequence if same author
Task: "Add environment query filter to /analytics/performance schema in app/q-server/.../tracking-analytics.schemas.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (error visibility)
4. **STOP and VALIDATE**: Run Quickstart Scenario 1 independently
5. Deploy/demo if ready — production error visibility is the highest-value increment per spec.md

### Incremental Delivery

1. Setup + Foundational → Tracker live in both deployment modes, environment-tagged
2. Add User Story 1 → validate → deploy (MVP: error visibility)
3. Add User Story 2 → validate → deploy (adds performance visibility)
4. Add User Story 3 → validate → deploy (adds PV/UV visibility)
5. Polish phase → validate remaining cross-cutting scenarios, update docs, run full gate

---

## Notes

- [P] tasks touch different files and have no incomplete dependency.
- [Story] labels map every user-story-phase task back to spec.md's US1/US2/US3 for traceability.
- T013/T014 (US1), T019/T020 (US2), and T025/T026 (US3) all touch the same two backend files
  (`tracking-analytics.schemas.ts` and `.service.ts`) — implemented together in one pass since one
  author (this session) did all three stories.
- Commit after each task or logical group; stop at any checkpoint to validate a story
  independently before continuing.
- Avoid: skipping T003 (app_id whitelist) — every other task's manual/automated verification will
  silently fail ingestion validation until that's done. (Verified already present in this case.)
- **Manual quickstart validation (T016/T023/T028/T029/T030) was not performed** — this session had
  no running Postgres/Redis/RabbitMQ/ClickHouse/q-server stack. Before merging, someone with a
  running local/staging stack should walk through `quickstart.md`'s 5 scenarios to close this gap.

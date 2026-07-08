<!--
Sync Impact Report
==================
Version change: (template, unratified) → 1.0.0
Rationale: Initial ratification of the project constitution. This is a MINOR/MAJOR-equivalent
  "first fill" of a placeholder template, treated as 1.0.0 per semantic versioning conventions
  for first-release governance documents.

Modified principles: N/A (initial authoring — no prior named principles existed)

Added sections:
  - Core Principles I–X (Monorepo Module Boundary Integrity; Strict Type Safety & Schema-First
    Validation; Unified API Contract & Response Envelope; Security-by-Default; Test-First /
    Test-Adequate Delivery; Observability & Structured Logging; Code Style & Static Analysis
    Compliance; Micro-Frontend & Cross-App Integration Discipline; AI/LLM Integration Governance;
    Performance & Data Pipeline Integrity)
  - Technology Stack Constraints (per-package mandatory stack table)
  - Development Workflow / Review Process / Quality Gates
  - Governance

Removed sections: N/A (template placeholders only)

Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ compatible as-is (Constitution Check gate is
    dynamically derived from this file; no hardcoded principle references to update)
  - .specify/templates/spec-template.md — ✅ compatible as-is (generic scope/requirements
    structure; no constitution-specific placeholders to sync)
  - .specify/templates/tasks-template.md — ✅ compatible as-is (generic phase/task structure;
    principle-driven task types such as observability/security/testing already fit the existing
    Foundational and Polish phase categories)
  - .specify/templates/checklist-template.md — ✅ compatible as-is (generic checklist scaffold)
  - .specify/templates/commands/*.md — ⚠ not present in this repository (no commands directory
    under .specify/templates); nothing to update
  - docs/README.md — ⚠ PENDING manual follow-up: this doc currently documents two competing
    response-envelope formats ({code,message,data} and {success,message,data}); Principle III
    now mandates a single canonical envelope ({code, msg, data}) and deprecates the
    success-boolean variant. docs/README.md should be updated in a follow-up PR to remove the
    "建议统一使用格式一" ambiguity and reflect the ratified envelope exactly.

Follow-up TODOs:
  - TODO(RATIFICATION_DATE): No prior ratified constitution existed; ratification date is set to
    the date this version was authored (2026-07-08) since no earlier adoption date is recorded
    anywhere in the repository history.
-->

# QuestionnaireSys Monorepo Constitution

## Core Principles

### I. Monorepo Module Boundary Integrity

Each of the four core packages (`app/ai-service`, `app/frontend`, `app/q-editor`, `app/q-server`)
owns its own dependency tree. Cross-package code reuse MUST go through published workspace
packages (`packages/*`, e.g. `monorepo-code-common`) or documented HTTP contracts — code MUST NOT
reach into another app's `src/` via relative (`../../app/...`) imports.

`q-server` is the single source of truth for persistence and cross-cutting business logic.
`ai-service` MUST treat `q-server` as an upstream API, calling it only via its internal,
API-key-authenticated HTTP client (`X-Internal-Api-Key`) — `ai-service` MUST NOT connect directly
to `q-server`'s PostgreSQL, Redis, MongoDB, ClickHouse, or MinIO backends.

LLM/AI wiring currently exists in both `q-server` (`src/modules/ai/*`, `src/config/langchain.ts`)
and `app/ai-service` (LangChain, Phase-2 agents). Any new AI capability MUST be assigned
explicitly to one side before implementation begins: synchronous, low-latency survey
generate/polish (SSE) capabilities belong in `q-server`; agentic, multi-step, or RAG-style
workflows belong in `ai-service`. Adding AI logic to the side not designated for a given
capability MUST NOT proceed without a written architecture decision record justifying the
exception.

Any type, interface, or utility function used by two or more packages MUST be extracted into
`packages/common` (or an equivalent workspace package) rather than copy-pasted across packages.

**Rationale**: Without enforced boundaries, a monorepo degrades into a tangle of implicit
cross-package coupling, making independent deployability and ownership impossible and creating
duplicate, drifting AI integration logic.

### II. Strict Type Safety & Schema-First Validation

All TypeScript packages (`frontend`, `q-editor`, `q-server`) MUST compile under `strict: true`.
Code MUST NOT introduce `any` except in caught-error narrowing (the one exception already
codified via ESLint override) — no blanket disabling of
`@typescript-eslint/no-explicit-any` elsewhere in the codebase.

All external input crossing a trust boundary — `q-server` route bodies/query/params, and
`ai-service` request models — MUST be validated with the package's canonical schema library
(Zod in `q-server`, Pydantic in `ai-service`) before use. Hand-rolled manual validation (ad hoc
`if` checks on request bodies) MUST NOT replace schema validation.

API response types consumed in `frontend` and `q-editor` MUST be declared as TypeScript
interfaces colocated with the relevant API module, and MUST mirror the backend's actual response
envelope (Principle III) exactly — untyped (`any`) API response handling MUST NOT be introduced.

**Rationale**: Type and schema discipline at every trust boundary is the primary defense against
malformed data propagating into business logic, and keeps frontend/backend contracts from
silently drifting apart.

### III. Unified API Contract & Response Envelope

The canonical response envelope for every HTTP API across `q-server` and `ai-service` MUST be:

```
{ code: number, msg: string, data: T | null }
```

where `code: 0` denotes success. This supersedes and deprecates the `{ success: boolean, message,
data }` variant documented as a legacy alternative in `docs/README.md`; any surviving usage of the
`success`-boolean format MUST be migrated to the canonical envelope as encountered, and MUST NOT
be extended to new endpoints.

Business error codes MUST be drawn from a centralized enum (mirroring `q-server`'s
`StatusCode`/`BizCode` pattern) — ad hoc numeric literals MUST NOT be introduced directly in
route handlers.

Paginated endpoints MUST return a consistent shape including total count, current page/cursor,
and page size — no endpoint may invent its own bespoke pagination envelope.

Every new or modified REST endpoint MUST be reflected in the project's interface documentation
(`docs/API接口文档.md` or an equivalent OpenAPI artifact) within the same PR that introduces the
change.

**Rationale**: A single, unambiguous response contract eliminates an entire class of frontend
integration bugs and is a prerequisite for automated contract testing.

### IV. Security-by-Default

CORS MUST NOT be configured with a wildcard (`origin: "*"` or `true`) outside local development
mode. `ai-service` and `q-server` MUST read an explicit origin allow-list from environment
configuration for any non-development deployment target.

Authentication MUST use the existing JWT bearer pattern in `q-server`. New protected routes MUST
apply the `authenticate` pre-handler and, where relevant, role checks (`requireSuperAdmin` or
equivalent) — routes MUST NOT implement bespoke, one-off authentication or authorization logic.

Secrets (JWT secret, database URLs, AI provider keys, MinIO/Redis/RabbitMQ credentials, internal
service API keys) MUST be sourced only from environment variables or `.env` files. Secrets MUST
NOT be hardcoded, logged, or committed to version control. Logging utilities MUST redact
`password`, `token`, `authorization`, and API-key fields (per the existing `logger.ts`
sanitization pattern); new log call sites MUST NOT bypass the sanitized logger to emit raw
request/response bodies.

All file uploads (MinIO-backed) MUST validate MIME type and size server-side before storage —
code MUST NOT trust a client-supplied `Content-Type` header alone.

Rate limiting MUST be applied to all public-facing ingestion and authentication endpoints
(mirroring `@fastify/rate-limit` with Redis-backed counters). Any new public endpoint introduced
without rate limiting MUST include an explicit justification in the PR description.

`ai-service` and any AI-invoking `q-server` module MUST treat user-supplied prompt content as
untrusted input: length/format constraints MUST be enforced (as already done via Pydantic field
constraints), and raw user input MUST NOT be interpolated into system prompts without
escaping/templating discipline.

**Rationale**: Security defaults must be the path of least resistance; deviations should require
active, visible effort rather than being the accidental default.

### V. Test-First / Test-Adequate Delivery

`q-server` (Vitest, `src/spec/**/*.spec.ts`), `frontend` and `q-editor` (Vitest), and `ai-service`
(pytest, `tests/test_*.py`) each have an established test runner. New business logic — services,
composables, agents, and utility functions containing branching logic — MUST ship with unit tests
in the same PR that introduces it.

Test coverage MUST NOT regress below the package's existing baseline. Authentication, any
payment/billing-equivalent logic, and tracking-ingestion code paths MUST maintain the highest
coverage tier in their respective package.

Bug fixes MUST include a regression test that fails before the fix is applied and passes after.

UI-affecting changes in `frontend`/`q-editor` MUST be manually verified in a running dev server
covering the golden path plus at least one edge case before being marked complete — passing
automated tests alone is not sufficient sign-off for UI correctness.

**Rationale**: Test-adequate delivery (rather than dogmatic TDD) matches the project's current
test maturity while still preventing untested business logic and regressions from merging.

### VI. Observability & Structured Logging

`q-server` MUST use its existing Pino-based structured logger (`request.log` /
`request.sanitizedLog`) — `console.log` MUST NOT be introduced in request-handling code paths.

`ai-service` MUST use Python's `logging` module with structured, leveled output. Bare `print()`
statements in startup/lifespan code are a known, tracked gap and MUST be remediated rather than
extended with further `print()` usage.

Every request MUST propagate or generate a trace/request ID (`x-trace-id` / `request.id`)
end-to-end across `frontend → q-server → ai-service` calls to enable cross-service correlation.

The tracking (埋点) pipeline (`q-server → RabbitMQ → ClickHouse consumer`) MUST preserve its
fallback-to-local-JSONL behavior for degraded-dependency scenarios. Any change to ingestion MUST
NOT remove the existing failure-safe fallback or event-dedup logic.

**Rationale**: Structured, correlated logging is what makes multi-service incidents debuggable;
silently regressing observability primitives (fallbacks, trace IDs) trades short-term convenience
for long-term blindness during outages.

### VII. Code Style & Static Analysis Compliance (Non-Negotiable Gate)

All TypeScript/Vue/JS files MUST pass the monorepo root ESLint flat config (`eslint.config.js`)
and Prettier (`prettier.config.js` — 120-character width, double quotes, no trailing commas) with
zero warnings on changed files.

Python files in `ai-service` MUST pass `ruff check` and `ruff format` per the rules in
`app/ai-service/pyproject.toml` (`E, F, I, N, W, UP, B, C4` selected, line length 100).

All changed files MUST pass `cspell lint` against the project dictionary. New technical terms or
acronyms MUST be added to `.cspell/custom-dictionary.txt` rather than suppressed inline.

The Husky `pre-commit` → `lint-staged` gate (`prettier --write`, `eslint --fix --cache`,
`cspell lint`) MUST NOT be bypassed with `--no-verify`, except by an explicit, logged maintainer
exception. CI MUST independently re-run the equivalent checks as a hard merge gate, since local
hooks alone are not a substitute for server-side enforcement.

No package may introduce a competing formatter or linter configuration that diverges from the
shared root config without an explicit, documented exception recorded in this constitution's
Governance section.

**Rationale**: A single, non-negotiable style/lint gate removes an entire category of PR review
friction and keeps the four heterogeneous packages visually and structurally consistent.

### VIII. Micro-Frontend & Cross-App Integration Discipline

`frontend` (qiankun host) and `q-editor` (qiankun sub-app) MUST preserve the
`bootstrap`/`mount`/`unmount`/`update` lifecycle contract and dynamic `public-path.ts` resolution.
Changes MUST NOT hardcode absolute asset paths or break the standalone-mode fallback (running
`q-editor` outside of qiankun).

Router base paths MUST remain configurable via `props.routerBase` injection — no sub-app route
MUST assume it is mounted at `/`.

Shared design tokens/CSS variables (Arco Design and Element Plus theme variables) MUST NOT be
duplicated or forked per app. Visual consistency changes MUST be coordinated across `frontend`
and `q-editor` in the same change set or an explicitly linked follow-up.

The concurrent token-refresh queue-and-lock pattern used in both apps' independent Pinia auth
stores MUST remain behaviorally consistent — a correctness fix applied to one app's auth store
MUST be evaluated for porting to the other.

**Rationale**: Micro-frontend architectures fail silently when lifecycle contracts or shared
visual/auth state drift between host and sub-app; explicit coordination requirements catch this
before it reaches users.

### IX. AI/LLM Integration Governance

All LLM provider configuration (model, temperature, max tokens, API keys, base URL) MUST be
environment-driven and provider-agnostic, matching the existing `AI_PROVIDER` abstraction —
provider-specific code (e.g., an OpenAI- or Anthropic-only code path) MUST NOT be hardcoded into
business logic.

Every LLM-calling endpoint MUST enforce input length limits and timeout budgets, and MUST degrade
gracefully with a structured error response on provider failure or timeout — unbounded retries or
silent hangs MUST NOT occur.

Streaming (SSE) endpoints MUST emit a well-defined, consistent event vocabulary (`token`,
`tool_call`, `done`, `error`) across both `q-server` and `ai-service` implementations.

Any RAG/vector-store or agentic (LangGraph) capability introduced in `ai-service` MUST document
data retention and PII handling for embedded content before merge.

**Rationale**: LLM integrations are a novel failure surface (provider outages, prompt injection,
unbounded cost/latency); provider-agnostic, timeout-bounded, well-documented integration is the
minimum bar for production use.

### X. Performance & Data Pipeline Integrity

ClickHouse-bound tracking writes MUST remain batched (not per-event synchronous writes) and MUST
preserve partition-pruning query discipline (mandatory date filters) for analytics endpoints.

Any new admin analytics query MUST specify and respect a caching TTL (Redis-backed, consistent
with the existing 30-second to 10-minute tiers) rather than querying ClickHouse on every request.

`frontend`/`q-editor` bundle changes MUST NOT regress the existing manual-chunking strategy
(vendor / UI-library / survey-engine chunk boundaries) without justification; new heavy
dependencies MUST be evaluated for code-splitting before being added to a shared chunk.

Database query changes (Prisma) affecting hot paths MUST be reviewed for N+1 query patterns and
appropriate indexing before merge.

**Rationale**: The tracking pipeline and admin analytics surfaces are the parts of this system
most exposed to unbounded data growth; performance discipline here prevents gradual degradation
that is expensive to retrofit later.

## Technology Stack Constraints

The following per-package stacks are locked in and MUST NOT be silently swapped, downgraded, or
replaced with an alternative library/framework without a constitution amendment:

| Package          | Mandatory Stack                                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/ai-service` | Python ≥3.11, FastAPI ≥0.115, Uvicorn, Pydantic v2 + `pydantic-settings`, LangChain ≥0.3 (+ optional LangGraph/ChromaDB extras), Ruff for lint/format, pytest + pytest-asyncio                                          |
| `app/frontend`   | Vue 3.5, Vite 7, TypeScript 5.9 (strict), Pinia 3 + persisted-state, Vue Router 4, Axios, Arco Design Vue + Element Plus, qiankun via `vite-plugin-qiankun`, Vitest + `@vue/test-utils`                                 |
| `app/q-editor`   | Vue 3.5, Vite 7, TypeScript 5.9 (strict), Pinia 3, Element Plus, Dexie (IndexedDB), vuedraggable, vue-i18n, qiankun sub-app lifecycle, Vitest                                                                           |
| `app/q-server`   | Node ≥22.17, Fastify 5, TypeScript 5.9 (strict, NodeNext ESM), Prisma 7 + PostgreSQL, Zod v4, ioredis, amqplib (RabbitMQ), Mongoose, `@clickhouse/client`, MinIO SDK, Pino, `@fastify/{helmet,cors,rate-limit}`, Vitest |

Engine constraints (`node >=22.17.0`, `pnpm >=10.12.4`) are enforced via `.npmrc`
`engine-strict=true` and MUST remain enforced. Downgrading these engine requirements requires a
constitution amendment.

## Development Workflow

- **Package manager**: pnpm workspaces only. npm or yarn lockfiles MUST NOT be introduced into
  any of the four packages.
- **Commits**: Conventional Commits are enforced via commitlint + cz-git (`pnpm commit`). The
  commit type MUST be one of the configured enum (`feat, fix, docs, style, refactor, perf, test,
build, ci, chore, revert, wip, workflow, types, release`). Scope SHOULD be one of
  `root|backend|frontend|q-editor|ai-service|components|utils|q-server|packages` — the scope
  enum MUST be extended to include `ai-service` as a valid value. The commit header MUST NOT
  exceed 108 characters; the body MUST have a leading blank line when present.
- **Pre-commit gate**: Husky's `pre-commit` hook runs `lint-staged` (Prettier → ESLint `--fix` →
  cspell) on staged files. This MUST pass before any commit lands and MUST NOT be skipped via
  `--no-verify` except by an explicit, logged maintainer exception.
- **PR requirements**: Every PR touching one of the four directories MUST: (1) pass
  lint/format/spellcheck; (2) pass the relevant package's test suite (`vitest run` / `pytest`);
  (3) include or update tests for behavioral changes; (4) update
  `docs/API接口文档.md` for any API surface change; (5) receive at least one reviewer approval
  that explicitly checks compliance with this constitution's principles (module boundaries,
  response envelope, security-by-default, observability).
- **Branching/versioning**: A lightweight branch-per-feature model with `main` protected. Direct
  force-push to `main` MUST NOT occur. Rebase/merge discipline MUST remain consistent with
  existing commit history conventions.
- **Compliance checks**: CI MUST independently re-verify lint, type-check, test, and build for
  whichever of the four packages changed in a given PR (path-filtered), rather than the whole
  monorepo, to keep feedback fast while still gating merges.
- **Documentation upkeep**: `docs/README.md` conventions (interface design, request/response
  flow, error handling patterns) MUST be updated whenever a documented convention changes. Stale
  or contradictory documentation — such as the two competing response-envelope formats predating
  this constitution — MUST be corrected as part of the PR that resolves the inconsistency, not
  deferred indefinitely.

## Governance

This constitution supersedes ad hoc conventions found only in code comments or tribal knowledge.
Where existing code violates a principle (e.g., `console.log`/`print()` usage, wildcard CORS, or
the dual response-envelope formats), this is a documented "known gap" requiring a tracked
remediation task rather than a silently tolerated exception.

Any deviation from a MUST rule requires an explicit exception recorded in the PR description.
Recurring exceptions to the same rule require a constitution amendment rather than repeated
ad hoc justification.

Amendments require: a proposed diff to this constitution, a stated rationale, identification of
the affected package(s), and a migration plan for any code that becomes non-compliant as a
result of the change.

This constitution is semantically versioned (MAJOR.MINOR.PATCH): MAJOR for backward-incompatible
governance changes (e.g., changing the mandatory response envelope shape); MINOR for new
principles or materially expanded sections; PATCH for clarifications and non-semantic wording
fixes. Ratified and Last Amended dates are recorded below and MUST be kept in ISO 8601
(YYYY-MM-DD) format.

**Version**: 1.0.0 | **Ratified**: 2026-07-08 | **Last Amended**: 2026-07-08

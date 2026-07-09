# Data Model: Q-Editor Production Monitoring Integration

This feature does not introduce new persistent storage or database tables — it extends the
existing `q-server` tracking pipeline's event shape and adds a new filter dimension to existing
analytics queries. Entities below map the spec's Key Entities to the concrete, already-existing
schema (`app/q-server/src/modules/tracking/tracking-ingest/tracking-ingest.schemas.ts`) plus the
one field this feature adds.

## Monitoring Event (existing `trackEventSchema`, extended)

The single, unified shape for every error / performance / usage event sent by the SDK.

| Field             | Type                                                                                          | Required      | Notes                                                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_id`        | string (1–128 chars)                                                                          | yes           | Existing. Client-generated idempotency key.                                                                                                                                                                                            |
| `event_name`      | string, lowercase snake-case, 1–64 chars                                                      | yes           | Existing. e.g. `js_error`, `page_load`, `page_view`.                                                                                                                                                                                   |
| `event_category`  | enum: `error \| perf \| behavior \| metric`                                                   | yes           | Existing (drives RabbitMQ routing). Errors → high-priority queue.                                                                                                                                                                      |
| `app_id`          | enum (`TRACKING_APP_IDS` whitelist)                                                           | yes           | Existing. **Must include a `q-editor` entry** — verified/registered as a Foundational task.                                                                                                                                            |
| **`environment`** | **enum: `production \| staging \| development`**                                              | **yes (NEW)** | **Added by this feature.** Resolved by the SDK from a build-time env var at init; validated server-side as a closed enum — invalid/missing values are rejected at ingest, not silently defaulted, so misconfiguration is caught early. |
| `user_id`         | number \| null                                                                                | no            | Existing.                                                                                                                                                                                                                              |
| `anonymous_id`    | string (≤128 chars)                                                                           | no            | Existing. Used for unique-visitor (UV) deduplication when `user_id` is absent.                                                                                                                                                         |
| `session_id`      | string (≤128 chars)                                                                           | no            | Existing.                                                                                                                                                                                                                              |
| `device_id`       | string (≤128 chars)                                                                           | no            | Existing.                                                                                                                                                                                                                              |
| `timestamp`       | ISO 8601 string (≤5 min in the future)                                                        | yes           | Existing (client-reported; `server_timestamp` is separately stamped by the ingest service).                                                                                                                                            |
| `client_env`      | object: `{os, browser, browser_version, screen_width, screen_height, network_type, language}` | no            | Existing.                                                                                                                                                                                                                              |
| `page_url`        | string (≤2048 chars)                                                                          | no            | Existing.                                                                                                                                                                                                                              |
| `page_title`      | string (≤256 chars)                                                                           | no            | Existing.                                                                                                                                                                                                                              |
| `sdk_version`     | string (≤32 chars)                                                                            | yes           | Existing.                                                                                                                                                                                                                              |
| `properties`      | object (≤8KB stringified)                                                                     | no            | Existing. Event-specific payload (e.g., error stack, timing duration). MUST NOT contain authored questionnaire content (FR-007).                                                                                                       |

**Validation rules** (existing + new):

- `environment` MUST be one of the three enum values; requests with any other value or a missing
  value MUST be rejected with a 400-equivalent validation error, consistent with how other
  required enum fields (`app_id`, `event_category`) already behave.
- All existing size/format constraints on other fields are unchanged.

## Editor Error Report (a Monitoring Event where `event_category = "error"`)

No new fields beyond the base Monitoring Event. Distinguishing/aggregation behavior:

- **Recurrence grouping**: handled by the existing ClickHouse-consumer dedup logic (in-memory Set,
  5-minute/100k-entry cleanup window) — unchanged by this feature.
- **Severity**: carried in `properties` (existing convention; not a top-level schema field).

## Editor Performance Metric (a Monitoring Event where `event_category = "perf"`)

No new fields beyond the base Monitoring Event. `properties` carries operation type (`load` /
`save`), duration in milliseconds, and outcome (`success` / `failure`) — populated by the new
`app/q-editor/src/plugins/tracking.ts` integration point when it wraps the editor's existing
load/save operations.

## Editor Usage Record (a Monitoring Event where `event_category = "behavior"`, `event_name = "page_view"`)

No new fields beyond the base Monitoring Event. PV is a count of these events; UV is a count of
distinct `anonymous_id`/`user_id` values over the query period — both computed by existing
`tracking-analytics` aggregation queries, unaffected in shape by this feature beyond the new
`environment` filter.

## Monitoring Dashboard View (existing `tracking-analytics` query surface, extended)

Represents the aggregated read side; no new entity/table. Extension for this feature:

| Endpoint                               | Existing filters                                           | New filter (this feature)                        |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `GET /api/admin/analytics/overview`    | (none)                                                     | `environment` (optional, default `production`)   |
| `GET /api/admin/analytics/trend`       | `metric, granularity, range, app_id?`                      | + `environment` (optional, default `production`) |
| `GET /api/admin/analytics/errors`      | `app_id?, range, top_n?, error_type?`                      | + `environment` (optional, default `production`) |
| `GET /api/admin/analytics/performance` | `app_id?, metric, range, page_url?`                        | + `environment` (optional, default `production`) |
| `GET /api/admin/analytics/funnel`      | `funnel_name, range, app_id?`                              | + `environment` (optional, default `production`) |
| `GET /api/admin/analytics/events`      | `event_name?, app_id?, user_id?, range, page?, page_size?` | + `environment` (optional, default `production`) |

**State transitions**: None — all entities here are immutable, append-only event records; there is
no editable/mutable state introduced by this feature.

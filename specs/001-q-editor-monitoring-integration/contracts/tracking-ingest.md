# Contract: Tracking Ingest (extended)

**Base**: `app/q-server`, mounted at `/api/v1` (existing module: `tracking-ingest`)

This feature does not add a new endpoint — it adds one required field (`environment`) to the two
existing endpoints' request schemas. Responses, rate limits, and body-size limits are unchanged.

## POST /api/v1/track

Single-event ingestion (used for immediately-flushed events, primarily `error` category).

**Request body** (`trackEventSchema`, delta highlighted):

```jsonc
{
  "event_id": "string, 1-128 chars",
  "event_name": "string, snake_case, 1-64 chars",
  "event_category": "error | perf | behavior | metric",
  "app_id": "<value from TRACKING_APP_IDS whitelist, MUST include q-editor>",
  "environment": "production | staging | development", // NEW, required
  "user_id": "number | null", // optional
  "anonymous_id": "string, <=128 chars", // optional
  "session_id": "string, <=128 chars", // optional
  "device_id": "string, <=128 chars", // optional
  "timestamp": "ISO 8601 string, <=5 min in the future",
  "client_env": {
    "os": "string",
    "browser": "string",
    "browser_version": "string",
    "screen_width": "number",
    "screen_height": "number",
    "network_type": "string",
    "language": "string"
  }, // optional
  "page_url": "string, <=2048 chars", // optional
  "page_title": "string, <=256 chars", // optional
  "sdk_version": "string, <=32 chars",
  "properties": { "...": "object, <=8KB stringified" } // optional
}
```

**Responses**:

- `204 No Content` — accepted (fire-and-forget; no envelope body per existing convention).
- `400` — validation failure (e.g., missing/invalid `environment`, unknown `app_id`, malformed
  `event_name`). Canonical `{code, msg, data: null}` envelope per Constitution Principle III.
- `429` — rate limit exceeded (60 req/sec/IP for this endpoint, unchanged).

**Compatibility note**: `environment` is required going forward for `q-editor`-originated events.
Existing producers not yet updated will fail validation once this schema change ships — this is
an intentional, coordinated rollout: the schema change and every existing SDK consumer's update
MUST land together (see tasks.md sequencing), or the field should temporarily default server-side
during a migration window if any other in-flight producer cannot be updated in the same release.

## POST /api/v1/track/batch

Batch ingestion (used for the SDK's buffered `perf`/`behavior`/`metric` events).

**Request body** (`trackBatchSchema`, delta highlighted):

```jsonc
{
  "events": [
    // each element is a trackEventSchema object as above, including the new "environment" field
  ]
  // array size: min 1, max 200 (unchanged)
}
```

**Responses**: same as single-event endpoint. Rate limit: 30 req/sec/IP (unchanged). Body size
limit: 512KB (unchanged).

## Non-functional guarantees (unchanged by this feature)

- Errors are routed to a high-priority RabbitMQ queue; `perf`/`behavior`/`metric` to the
  lazy analytics queue — routing key logic (`{category}.{app_id}`) is unaffected by adding
  `environment`, since routing continues to key off `event_category` and `app_id` only.
- If RabbitMQ is unavailable, events fall back to local JSONL — unaffected.
- The consumer's in-memory dedup (5 min / 100k entries) — unaffected.

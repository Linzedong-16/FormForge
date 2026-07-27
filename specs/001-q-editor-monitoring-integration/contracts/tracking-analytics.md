# Contract: Tracking Analytics (extended)

**Base**: `app/q-server`, mounted at `/api/admin` (existing module: `tracking-analytics`,
requires authenticated `super_admin` role — unchanged).

This feature adds one optional query parameter, `environment`, to each existing endpoint below.
When omitted, it MUST default to `production` so that existing dashboard consumers see
production-only data by default (matching the spec's resolved clarification: production-only view
unless explicitly widened) even though the ingest pipeline now carries all environments.

All responses continue to use the canonical `{code, msg, data}` envelope (Constitution
Principle III) — unchanged by this feature.

| Endpoint                           | Method | Existing query params                                      | New param                                                                                                                   |
| ---------------------------------- | ------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/analytics/overview`    | GET    | —                                                          | `environment?: production\|staging\|development` (default `production`)                                                     |
| `/api/admin/analytics/realtime`    | GET    | —                                                          | _(not extended — 5-minute operational snapshot stays environment-unfiltered by design; low-value to filter a 5-min window)_ |
| `/api/admin/analytics/trend`       | GET    | `metric, granularity, range, app_id?`                      | `environment?` (default `production`)                                                                                       |
| `/api/admin/analytics/errors`      | GET    | `app_id?, range, top_n?, error_type?`                      | `environment?` (default `production`)                                                                                       |
| `/api/admin/analytics/performance` | GET    | `app_id?, metric, range, page_url?`                        | `environment?` (default `production`)                                                                                       |
| `/api/admin/analytics/funnel`      | GET    | `funnel_name, range, app_id?`                              | `environment?` (default `production`)                                                                                       |
| `/api/admin/analytics/ai-usage`    | GET    | `range`                                                    | _(not extended — unrelated to q-editor tracking events)_                                                                    |
| `/api/admin/analytics/events`      | GET    | `event_name?, app_id?, user_id?, range, page?, page_size?` | `environment?` (default `production`)                                                                                       |

**Example**: `GET /api/admin/analytics/errors?range=24h&app_id=q-editor&environment=production&top_n=10`

**Response** (unchanged envelope, illustrative):

```jsonc
{
  "code": 0,
  "msg": "ok",
  "data": {
    "range": "24h",
    "app_id": "q-editor",
    "environment": "production",
    "items": [{ "error_type": "...", "message": "...", "count": 42, "first_seen": "...", "last_seen": "..." }]
  }
}
```

**Validation rules**:

- `environment`, when provided, MUST be one of `production | staging | development`; any other
  value MUST be rejected with a `400` validation error using the canonical error envelope.
- Existing filters (`app_id`, `range`, `granularity`, etc.) are unaffected and combine with
  `environment` as additional `AND` conditions in the underlying ClickHouse query.

**Performance note**: `environment` MUST be added as an indexed/low-cardinality filter alongside
the existing mandatory date-partition filter — it must not be used as a substitute for date
filtering, preserving Constitution Principle X's partition-pruning requirement.

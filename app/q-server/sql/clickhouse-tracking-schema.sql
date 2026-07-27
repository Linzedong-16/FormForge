-- ============================================================
-- 问卷系统监控 — ClickHouse 建表脚本
-- 对齐设计文档 §5.2（数据存储方案）
--
-- 使用方式：
--   clickhouse-client < sql/clickhouse-tracking-schema.sql
--   或在 ClickHouse HTTP 接口执行
--
-- 数据库：questionnaire_tracking
-- ============================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS questionnaire_tracking;

USE questionnaire_tracking;

-- ============================================================
-- 1. 事件明细表（tracking_events）
-- 用途: 所有埋点事件的原始明细存储
-- 引擎: MergeTree（生产可用 ReplicatedMergeTree）
-- 分区: 按天 → 方便 TTL 过期删除
-- 排序键: (app_id, event_name, timestamp) → 按应用+事件类型查询最优
-- ============================================================

CREATE TABLE IF NOT EXISTS tracking_events (
    -- 主键/排序列
    event_id        String,                        -- UUID v7，全局去重
    timestamp       DateTime64(3),                 -- 毫秒精度，排序键核心
    date            Date DEFAULT toDate(timestamp), -- 分区键

    -- 公共字段
    event_name      LowCardinality(String),        -- 事件名（基数低）
    app_id          LowCardinality(String),        -- 应用标识
    environment     LowCardinality(String) DEFAULT 'production', -- 部署环境：production/staging/development
    user_id         UInt64 DEFAULT 0,              -- 用户 ID（0=未登录）
    anonymous_id    String DEFAULT '',             -- 匿名用户 ID
    session_id      String DEFAULT '',             -- 会话 ID
    device_id       String DEFAULT '',             -- 设备 ID
    sdk_version     LowCardinality(String) DEFAULT '',

    -- 时间相关
    client_timestamp    DateTime64(3) DEFAULT timestamp,
    server_timestamp    DateTime64(3) DEFAULT now64(3),

    -- 客户端环境
    client_os       LowCardinality(String) DEFAULT '',
    client_browser  LowCardinality(String) DEFAULT '',
    browser_version LowCardinality(String) DEFAULT '',
    device_type     LowCardinality(String) DEFAULT '',   -- desktop / mobile / tablet
    screen_width    UInt16 DEFAULT 0,
    screen_height   UInt16 DEFAULT 0,
    network_type    LowCardinality(String) DEFAULT '',   -- 4g / 5g / wifi / ethernet

    -- 地理位置（粗粒度）
    geo_region      LowCardinality(String) DEFAULT '',   -- 省份
    geo_city        LowCardinality(String) DEFAULT '',   -- 城市

    -- 页面上下文
    page_url        String DEFAULT '',
    page_title      String DEFAULT '',
    referrer        String DEFAULT '',

    -- 事件属性（半结构化 JSON）
    properties      String DEFAULT '{}',

    -- 元数据
    client_ip_hash  String DEFAULT '',                   -- SHA256(client_ip) 前16位
    ingest_batch_id String DEFAULT ''                    -- 上报批次 ID
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(date)
ORDER BY (app_id, event_name, toStartOfHour(timestamp), timestamp)
TTL date + INTERVAL 90 DAY DELETE
SETTINGS
    index_granularity = 8192,
    ttl_only_drop_parts = 1;

-- 二级索引：加速 user_id 精确查询
ALTER TABLE tracking_events ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter GRANULARITY 4;
-- 二级索引：加速 session_id 精确查询
ALTER TABLE tracking_events ADD INDEX IF NOT EXISTS idx_session_id session_id TYPE bloom_filter GRANULARITY 4;

-- 已部署环境的幂等迁移：为存量表补充 environment 列（新建表已通过上方 CREATE TABLE 包含此列）
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS environment LowCardinality(String) DEFAULT 'production' AFTER app_id;

-- ============================================================
-- 2. 错误聚合物化视图（tracking_errors_hourly_mv）
-- 用途: 错误事件的每小时聚合，供告警和趋势图
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tracking_errors_hourly_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (app_id, error_group_key, hour)
TTL date + INTERVAL 365 DAY
AS SELECT
    toDate(timestamp) AS date,
    toStartOfHour(timestamp) AS hour,
    app_id,
    cityHash64(
        concat(
            JSONExtractString(properties, 'error_type'),
            substring(JSONExtractString(properties, 'error_message'), 1, 100)
        )
    ) AS error_group_key,
    JSONExtractString(properties, 'error_type') AS error_type,
    substring(JSONExtractString(properties, 'error_message'), 1, 200) AS error_message_sample,
    count() AS error_count,
    uniq(user_id) AS affected_users,
    uniq(session_id) AS affected_sessions
FROM tracking_events
WHERE event_name IN ('js_error', 'vue_error', 'api_error', 'sse_error', 'resource_error')
GROUP BY date, hour, app_id, error_group_key, error_type, error_message_sample;

-- ============================================================
-- 3. 性能聚合物化视图（tracking_perf_hourly_mv）
-- 用途: 页面性能 + API 性能的每小时聚合
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tracking_perf_hourly_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (app_id, event_name, page_url_hash, hour)
TTL date + INTERVAL 365 DAY
AS SELECT
    toDate(timestamp) AS date,
    toStartOfHour(timestamp) AS hour,
    app_id,
    event_name,
    cityHash64(page_url) AS page_url_hash,
    any(page_url) AS page_url_sample,
    count() AS sample_count,
    avg(JSONExtractFloat(properties, 'fcp_ms')) AS avg_fcp_ms,
    quantileState(0.50)(JSONExtractFloat(properties, 'fcp_ms')) AS p50_fcp_state,
    quantileState(0.95)(JSONExtractFloat(properties, 'fcp_ms')) AS p95_fcp_state,
    avg(JSONExtractFloat(properties, 'lcp_ms')) AS avg_lcp_ms,
    quantileState(0.50)(JSONExtractFloat(properties, 'lcp_ms')) AS p50_lcp_state,
    quantileState(0.95)(JSONExtractFloat(properties, 'lcp_ms')) AS p95_lcp_state,
    avg(JSONExtractFloat(properties, 'duration_ms')) AS avg_duration_ms,
    quantileState(0.95)(JSONExtractFloat(properties, 'duration_ms')) AS p95_duration_state
FROM tracking_events
WHERE event_name IN ('page_perf', 'api_perf')
GROUP BY date, hour, app_id, event_name, page_url_hash;

-- ============================================================
-- 4. 业务漏斗聚合物化视图（tracking_funnel_daily_mv）
-- 用途: 每日关键业务事件计数（漏斗分析数据源）
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tracking_funnel_daily_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (app_id, event_name, date)
TTL date + INTERVAL 2 YEAR
AS SELECT
    toDate(timestamp) AS date,
    app_id,
    event_name,
    count() AS event_count,
    uniq(user_id) AS unique_users,
    uniqIf(user_id, user_id != 0) AS unique_logged_in_users,
    uniq(session_id) AS unique_sessions
FROM tracking_events
WHERE event_name IN (
    'page_view', 'survey_view',
    'editor_create_survey', 'editor_publish_survey',
    'editor_use_ai_generate', 'editor_use_ai_polish',
    'survey_submit_start', 'survey_submit_success', 'survey_abandon',
    'admin_approve_review', 'user_login'
)
GROUP BY date, app_id, event_name;

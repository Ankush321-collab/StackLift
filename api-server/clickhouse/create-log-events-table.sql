-- Create log_events table in ClickHouse
-- Run this script to ensure the table exists

CREATE TABLE IF NOT EXISTS log_events (
    event_id String,
    deployment_id String,
    log String,
    timestamp DateTime
) ENGINE = MergeTree()
ORDER BY (deployment_id, timestamp)
PARTITION BY toYYYYMM(timestamp);
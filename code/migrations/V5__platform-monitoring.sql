CREATE DATABASE IF NOT EXISTS mysimbdp_platform;
USE mysimbdp_platform;

CREATE TABLE IF NOT EXISTS ingest_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id STRING NOT NULL,
    worker_id STRING NOT NULL,
    ts TIMESTAMP DEFAULT now(),
    rows_inserted INT,
    batch_latency_ms INT
    );
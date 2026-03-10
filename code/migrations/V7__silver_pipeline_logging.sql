CREATE DATABASE IF NOT EXISTS mysimbdp_platform;
USE mysimbdp_platform;

CREATE TABLE IF NOT EXISTS silver_pipeline_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id STRING NOT NULL,
    pipeline_name STRING NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL,
    duration_ms INT NOT NULL,
    rows_processed INT NOT NULL,
    status STRING NOT NULL,
    error STRING
    );

CREATE INDEX IF NOT EXISTS idx_silver_logs_tenant
    ON silver_pipeline_logs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_silver_logs_started_at
    ON silver_pipeline_logs (started_at);
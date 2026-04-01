CREATE DATABASE IF NOT EXISTS streamanalytics;
USE streamanalytics;

CREATE TABLE IF NOT EXISTS subreddit_window_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    tenant_id STRING NOT NULL,
    subreddit STRING NOT NULL,

    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,

    comment_count INT NOT NULL,

    created_at TIMESTAMPTZ DEFAULT now()
    );
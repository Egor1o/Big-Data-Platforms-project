USE streamanalytics;

CREATE TABLE IF NOT EXISTS late_events (
    id STRING PRIMARY KEY,

    subreddit STRING,
    created_utc INT,

    arrival_time TIMESTAMPTZ,
    reason STRING,

    tenant_id STRING,

    created_at TIMESTAMPTZ DEFAULT now()
);
USE streamanalytics;

CREATE TABLE IF NOT EXISTS streaming_metrics (
   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    ts TIMESTAMPTZ NOT NULL,

    processed_messages INT,
    processing_latency_ms INT,
    window_delay_ms INT,

    worker_id STRING,

    created_at TIMESTAMPTZ DEFAULT now()
    );
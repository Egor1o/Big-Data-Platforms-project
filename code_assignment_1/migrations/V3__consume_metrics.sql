USE reddit;
CREATE TABLE IF NOT EXISTS consume_metrics (
    ts TIMESTAMPTZ NOT NULL,
    consumer_id INT NOT NULL,
    query_type STRING NOT NULL,
    rows_returned INT NOT NULL,
    query_latency_ms INT NOT NULL
);
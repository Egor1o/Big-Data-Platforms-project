USE reddit;
CREATE TABLE ingest_metrics (
ts TIMESTAMPTZ NOT NULL,
worker_id INT NOT NULL,
rows_inserted INT NOT NULL,
batch_latency_ms INT NOT NULL
);

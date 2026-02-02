### Instructions for mysimbdp-coredms

In order to get performance metrics for the write operations with different stats, please follow the recommended workflow below.

1. Assuming your CockroachDB cluster is not up, run:

```sh
docker
```


2. Then first get to the Reddit database by running:

```sql
USE reddit;
```

3. Finally run following sql aggregator:

```sql
WITH params AS (
    SELECT
        'START_TIME'::timestamptz AS start_ts,
        'END_TIME'::timestamptz AS end_ts
),
duration AS (
    SELECT
        EXTRACT(EPOCH FROM (end_ts - start_ts))::DECIMAL AS seconds
    FROM params
)
SELECT
    SUM(rows_inserted)        AS total_rows,
    SUM(rows_inserted) / MAX(d.seconds) AS avg_rows_per_second,
    AVG(batch_latency_ms)     AS avg_latency_ms,
    percentile_cont(0.95)
        WITHIN GROUP (ORDER BY batch_latency_ms::FLOAT) AS p95_latency_ms,
    percentile_cont(0.99)
        WITHIN GROUP (ORDER BY batch_latency_ms::FLOAT) AS p99_latency_ms
FROM ingest_metrics
    CROSS JOIN params p
    CROSS JOIN duration d
WHERE ts BETWEEN p.start_ts AND p.end_ts;
```

In the query command above, please replace `START_TIME` and `END_TIME` with the actual time range you want to analyze.


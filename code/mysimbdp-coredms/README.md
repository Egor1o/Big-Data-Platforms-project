## Instructions for mysimbdp-coredms

In order to get performance metrics for the write operations with different stats, please follow the recommended 
workflow below.


1. Assuming your CockroachDB cluster is up, you can access one of the cockroach nodes (bellow node number 1):

```sh
docker exec -it roach-1 cockroach sql --insecure
```


2. Then first get to the metrics database by running:

```sql
USE mysimbdp_platform;
```

3. You can check whether the migrations are successfully deployed at this point by running (there should be 1 table)
```sh
\dt
```
You can also run any SQL query at this point to check the validity of the data.

4. Finally run following sql aggregator:

```sql
WITH params AS (
    SELECT
        '2026-03-04 18:30:00+00'::timestamptz AS start_ts,
        '2026-03-04 18:40:00+00'::timestamptz AS end_ts
),
     duration AS (
         SELECT
             EXTRACT(EPOCH FROM (end_ts - start_ts))::DECIMAL AS seconds
         FROM params
     )
SELECT
    SUM(rows_inserted)                                  AS total_rows,
    SUM(rows_inserted) / MAX(d.seconds)                 AS avg_rows_per_second,
    SUM(ingestion_bytes)                                AS total_bytes,
    SUM(ingestion_bytes) / MAX(d.seconds)               AS avg_bytes_per_second,
    AVG(avg_batch_latency_ms)                           AS avg_latency_ms,
    percentile_cont(0.95)
                                                           WITHIN GROUP (ORDER BY avg_batch_latency_ms::FLOAT) AS p95_latency_ms,
    percentile_cont(0.99)
        WITHIN GROUP (ORDER BY avg_batch_latency_ms::FLOAT) AS p99_latency_ms
FROM mysimbdp_platform.ingest_metrics
    CROSS JOIN params p
    CROSS JOIN duration d
WHERE ts BETWEEN p.start_ts AND p.end_ts
  AND tenant_id = 'tenant-a';
```

In the query command above, please replace time ranges with the actual time range you want to analyze.
Also, the query above will take only tenant-a, so if you would like to get metrics from b, change the name.

### Replication factor
To check the replication factor of either access cluster's overview page at http://localhost:8080/#/overview/list, 
or run this in the node:
```sql
SHOW ZONE CONFIGURATION FOR RANGE default;
```



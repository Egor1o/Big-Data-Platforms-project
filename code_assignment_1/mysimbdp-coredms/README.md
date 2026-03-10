## Instructions for mysimbdp-coredms

In order to get performance metrics for the write/read operations with different stats, please follow the recommended 
workflow below.


1. Assuming your CockroachDB cluster is up, you can access one of the cockroach nodes (bellow node number 1):

```sh
docker exec -it roach-1 cockroach sql --insecure
```


2. Then first get to the Reddit database by running:

```sql
USE reddit;
```

3. You can check whether the migrations are successfully deployed at this point by running (there should be 3 tables)
```sh
\dt
```
You can also run any SQL query at this point to check the validity of the data.

4. Finally run following sql aggregator:

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
For the read operations stored in the database, change the parameters accordingly. Change the name of the table 
and the fields in the SUMs.

### Replication factor
To check the replication factor of either access cluster's overview page at http://localhost:8080/#/overview/list, 
or run this in the node:
```sql
SHOW ZONE CONFIGURATION FOR RANGE default;
```



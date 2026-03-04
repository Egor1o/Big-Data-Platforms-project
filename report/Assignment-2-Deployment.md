## Recommended workflow

Execute further commands in dedicated order. Please, execute the commands from the root folder.

1. To get up cockroach instances, run:
```sh
docker compose up cockroach-1 cockroach-2 cockroach-3 --build
```

2. To initialize cluster, run:
```sh
docker exec -it roach-1 ./cockroach init --insecure 
```

3. Then run Flyway migrations:
```sh
docker compose up flyway
```

4. (Optional) Get Grafana up (check set up instructions bellow):
```sh
docker compose up -d grafana
```

4. Start kafka in detached mode:
```sh
docker compose up -d kafka --build
```

5. Run Kafka topic initializers of tenants:
```sh
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh --create --if-not-exists --topic tenant-a-bronze --bootstrap-server kafka:9092 --partitions 5 --replication-factor 1 && \
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh --create --if-not-exists --topic tenant-b-bronze --bootstrap-server kafka:9092 --partitions 5 --replication-factor 1 && \
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh --create --if-not-exists --topic metrics --bootstrap-server kafka:9092 --partitions 2 --replication-factor 1 && \
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh --create --if-not-exists --topic manager-control --bootstrap-server kafka:9092 --partitions 1 --replication-factor 1
```

6. Start Monitoring system:
```sh
docker compose up stream-ingest-monitor --build
```

7. Now you can start either manager, which will scale replicas, or start workers manually:
- For manager: go to the folder /code2/stream-ingest-manager and run:
```sh
npm run build && node dist/producer.js
```
- to start workers manually, run:
```shell
docker compose up -d --build --scale tenant-<index>-worker=<replication factor> tenant-<index>-worker
```

8. Start message producers for tenants:
```sh
docker compose up producer-a producer-b --build
```


## Apache Kafka
If you want to run Kafka, please note that the Docker-related .sh files are located in /opt/kafka/bin.
Therefore, open the Kafka terminal (with a running Kafka instance) and navigate there:
```shell
docker exec -it -w /opt/kafka/bin kafka bash
```

To create a topic manually (for example, if you want to test adding a worker for another tenant), run:
```sh
./kafka-topics.sh \
  --create \
  --topic <name> \
  --bootstrap-server kafka:9092 \
  --partitions <number> \
  --replication-factor <number>
```

### Cluster's monitoring
When your CockroachDB cluster is up, you can see the state of one here: http://localhost:8080/#/overview/list

### Grafana setup

After Grafana is up, you need to add a new data source.
Go to http://localhost:3000, login with admin/admin,
then go to Data Sources -> Add data source -> PostgreSQL.

| Setting | Value |
|---------|-------|
| **Default Login** | admin / admin |
| **Host** | cockroach-1:26257 |
| **Database** | mysimbdp_platform |
| **User** | root |
| **Password** | (leave empty) |
| **SSL Mode** | disable |
| **PostgreSQL Version** | 12+ |

After that, got to ad visualization -> Time series and use the following queries:
Also set interval to 5s (or to other preferred intervals.)


Grafana queris:
1. For rows inserted over time (throughput) – tenant-a:
```sql
SELECT
    $__timeGroupAlias(ts, '10s'),
    SUM(rows_inserted) AS value
FROM mysimbdp_platform.ingest_metrics
WHERE $__timeFilter(ts)
  AND tenant_id = 'tenant-a'
GROUP BY 1
ORDER BY 1;
```
2. For rows inserted over time (throughput) – tenant-b:
```sql
SELECT
$__timeGroupAlias(ts, '10s'),
SUM(rows_inserted) AS value
FROM mysimbdp_platform.ingest_metrics
WHERE $__timeFilter(ts)
AND tenant_id = 'tenant-b'
GROUP BY 1
ORDER BY 1;
```
3. For average batch latency over time (response time) – tenant-a:
```sql
SELECT
  $__timeGroupAlias(ts, '10s'),
  AVG(avg_batch_latency_ms) AS value
FROM mysimbdp_platform.ingest_metrics
WHERE $__timeFilter(ts)
  AND tenant_id = 'tenant-a'
GROUP BY 1
ORDER BY 1;
```
4. For average batch latency over time (response time) – tenant-b:
```sql
SELECT
  $__timeGroupAlias(ts, '10s'),
  AVG(avg_batch_latency_ms) AS value
FROM mysimbdp_platform.ingest_metrics
WHERE $__timeFilter(ts)
  AND tenant_id = 'tenant-b'
GROUP BY 1
ORDER BY 1;
```
5. For rows read over time (throughput) – tenant-a:
```sql
SELECT
  $__timeGroupAlias(ts, '10s'),
  SUM(rows_returned) AS value
FROM mysimbdp_platform.consume_metrics
WHERE $__timeFilter(ts)
  AND tenant_id = 'tenant-a'
GROUP BY 1
ORDER BY 1;
```
6. For rows read over time (throughput) – tenant-b:
```sql
SELECT
  $__timeGroupAlias(ts, '10s'),
  SUM(rows_returned) AS value
FROM mysimbdp_platform.consume_metrics
WHERE $__timeFilter(ts)
  AND tenant_id = 'tenant-b'
GROUP BY 1
ORDER BY 1;
```

Notice that sample dataset is very small and your Grafana logs ill be very short. It is intentional.
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

4. Start kafka in detached mode:
```sh
docker compose up -d kafka --build
```

5. Run Kafka topic initializers of tenants:
```sh
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh --create --if-not-exists --topic stream-tenant-a --bootstrap-server kafka:9092 --partitions 10 --replication-factor 1
```

6. Start the producer
```shell
docker compose up producer --build
```

7. Start streamers (change amount of replicas if needed. 1 by default):
```shell
docker compose up --build --scale stream-analytics=1 stream-analytics;
 1170
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

## Cluster's monitoring
When your CockroachDB cluster is up, you can see the state of one here: http://localhost:8080/#/overview/list

### DB aggregation
1. Access correct db: 
```sql
USE streamanalytics;
```
3. Specific subbreddit:
```sql
SELECT *
FROM subreddit_window_stats
WHERE subreddit = 'gaming'
ORDER BY window_start DESC;
```

2. Aggregation:
```sql
SELECT subreddit, SUM(comment_count) AS total_comments
FROM subreddit_window_stats
GROUP BY subreddit
ORDER BY total_comments DESC
LIMIT 10;
```
3. Time range:
```sql
SELECT
SUM(comment_count) AS total_comments
FROM subreddit_window_stats
WHERE created_at >= '2026-04-04 10:28:00'
AND created_at <= '2026-04-04 10:33:00';
```
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
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh --create --if-not-exists --topic stream-tenant-a --bootstrap-server kafka:9092 --partitions 10 --replication-factor 1
```

## Apache Kafka
If you want to run Kafka, please note that the Docker-related .sh files are located in /opt/kafka/bin.
Therefore, open the Kafka terminal (with a running Kafka instance) and navigate there:
```shell
docker exec -it -w /opt/kafka/bin kafka bash
```
docker compose up producer --build
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

## Grafana setup

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
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

5. To execute ingestion workers, run:

* 10 workers:
```sh 
docker compose up ingest-1 ingest-2 ingest-3 ingest-4 ingest-5 ingest-6 ingest-7 ingest-8 ingest-9 ingest-10
``` 
* 5 workers:
```sh 
docker compose up ingest-1 ingest-2 ingest-3 ingest-4 ingest-5 
``` 
* 1 worker:
```sh 
docker compose up ingest-1  
``` 
If you want to test less or more amount of workers, just remove unnecessary services from the command above.

6. To execute consumer workers, run:

* 5 consumers:
```sh 
docker compose up consumer-1 consumer-2 consumer-3 consumer-4 consumer-5
``` 
* 1 consumer:
```sh 
docker compose up consumer-1  
``` 
If you want to test less or more amount of consumers, just remove unnecessary services from the command above.

### Notice
Before going down, please note the following:

1. Due to the structure of the project, changes in the core code are not reflected in the running containers. Therefore,
   if you modify any part of the code and want to see the changes, you need to rebuild the containers by adding the --build
   flag to the end of the docker-compose command.
2. If you remove the main node connected to Grafana (cockroach-1), Grafana will lose connection to the database. As stated
   earlier in reality database is still up and ingestors are working, but Grafana will not be able to show any metrics until you
   reconnect it to any of the running nodes. So, prefer to close nodes that are not connected to Grafana first.
3. Please check the README.md files in the code/ folder, as they will guide you through the code structure and the idea. 
   Especially check code/db/README.md for instructions on how to get raw metrics from the database if you do not want to use Grafana.
4. Check README.md in the data, in order to understand where to place the Reddit's database file.

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
| **Database** | reddit |
| **User** | root |
| **Password** | (leave empty) |
| **SSL Mode** | disable |
| **PostgreSQL Version** | 12+ |

After that, got to ad visualization -> Time series and use the following queries:
Also set interval to 5s (or to other preferred intervals.)


Grafana query:
1. For rows inserted over time (throughput):
```sql
SELECT
$__timeGroupAlias(ts, '5s'),
SUM(rows_inserted) AS value
FROM ingest_metrics
WHERE $__timeFilter(ts)
GROUP BY 1
ORDER BY 1;
```
2. For average batch latency over time of insertion (response time):
```sql
SELECT
$__timeGroupAlias(ts, '5s'),
AVG(batch_latency_ms) AS value
FROM ingest_metrics
WHERE $__timeFilter(ts)
GROUP BY 1
ORDER BY 1;
```
3. For rows read over time (throughput):
```sql
SELECT
$__timeGroupAlias(ts, '5s'),
SUM(rows_returned) AS value
FROM consume_metrics
WHERE $__timeFilter(ts)
GROUP BY 1
ORDER BY 1;
```

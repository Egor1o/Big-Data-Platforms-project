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
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh \
  --create \
  --if-not-exists \
  --topic tenantA-bronze \
  --bootstrap-server kafka:9092 \
  --partitions 5 \
  --replication-factor 1
```

```sh
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh \
  --create \
  --if-not-exists \
  --topic tenantB-bronze \
  --bootstrap-server kafka:9092 \
  --partitions 5 \
  --replication-factor 1
```

6. fff
```sh
docker compose up producer-1 --build
```

```sh
docker compose up tenant-a tenant-b --build
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
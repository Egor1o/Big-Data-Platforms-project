### Instructons

## Recommended workflow

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

4. To execute ingestion workers, run:
```sh 
docker compose up ingest-1 ingest-2 ingest-3 ingest-4 ingest-5 ingest-6 ingest-7 ingest-8 ingest-9 ingest-10
``` 
If you want to test less amount of workers, just remove unnecessary services from the command above.

### Notice
Due to the structure of the project, changes in the core code are not reflected in the running containers. Therefore,
if you modify any part of the code and want to see the changes, you need to rebuild the containers by adding the --build
flag to the end of the docker-compose command.



### Cluster's monitoring
http://localhost:8080/#/overview/list

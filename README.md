### Instructons

## Recommended workflow

1. To get up cockroach instances, run:
```sh
docker compose up cockroach-1 cockroach-2 cockroach-3
```

2. To initialize cluster, run:
```sh
docker exec -it roach-1 ./cockroach init --insecure 
``` 
3. To execute ingestion workers, run:
```sh 
docker compose up ingest-1 ingest-2 ingest-3 ingest-4 ingest-5 ingest-6 ingest-7 ingest-8 ingest-9 ingest-10
``` 



### Cluster's monitoring
http://localhost:8080/#/overview/list

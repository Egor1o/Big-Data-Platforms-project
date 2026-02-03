## Description

This is the directory containing the ingestor code for the assignment. The ingestor is connected to both the source
SQLite database and the CockroachDB cluster. The ingestor reads data from the SQLite database in batches of 500 rows 
and inserts them into the CockroachDB cluster.

Each batch insertion operation is stored in a dedicated ingest_metrics table.

The connection to the cluster is kept alive by the ```getClient``` function and a try–catch block that reconnects if the 
connection is lost. This is needed if you decide to remove a node to which the ingestor is connected.

Every read from the SQLite database is done using a mapper function that maps all the fields from the source database.

The code is TypeScript-based and uses ts-node to run directly without compilation. It is recommended to run everything in Docker.

If you run the code in Docker, on each change please add the --build flag to rebuild the container.
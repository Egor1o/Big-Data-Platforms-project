## Description

This is the directory containing the consumer code for the assignment. The consumer is connected
to the database in the same way as the ingestor. The consumer has two operations that it executes
in parallel using Promise.all. These are reading 5000 newest comments and 500 most popular comments
from the database.

Each read operation is stored into dedicated ```consume_metrics``` table.

Code is typescrit based and uses ts-node to run directly without compilation. It is recommended 
to run everything in docker.

If you run the code in docker, on each change please attach ```--build``` flag to rebuild the container.
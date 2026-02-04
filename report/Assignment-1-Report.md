# Assignment 1 – Building Your Big Data Platform

## Part 1 – Design

### 1. Application domain, data, and assumptions

My application’s domain is built around ingesting and storing large-scale data in the form of message content
from the Reddit platform. The data used by the application is retrieved from Kaggle and
is available at https://www.kaggle.com/datasets/kaggle/reddit-comments-may-2015.

After unpacking the dataset, the data source is stored as an SQLite database file containing a single table
named “May2015” with 22 columns.

| Column name | Description |
|------------|------------|
| created_utc | Timestamp of comment creation (Unix time) |
| subreddit | Name of the subreddit where the comment was posted |
| subreddit_id | Unique identifier of the subreddit |
| id | Unique identifier of the comment |
| parent_id | Identifier of the parent comment or post |
| link_id | Identifier of the related post |
| author | Username of the comment author |
| body | Text content of the comment |
| ups | Number of upvotes |
| downs | Number of downvotes |
| score | Comment score |
| score_hidden | Indicates whether the score is hidden |
| gilded | Number of times the comment was gilded |
| controversiality | Controversiality flag |
| distinguished | Moderator/admin distinction flag |
| edited | Indicates whether the comment was edited |
| archived | Indicates whether the comment is archived |
| removal_reason | Reason for comment removal, if any |
| retrieved_on | Timestamp when the comment was retrieved |
| author_flair_text | Author flair text |
| author_flair_css_class | Author flair CSS class |
| name | Full Reddit identifier of the comment |

For the application, I have chosen CockroachDB as the database. This choice is mainly based on the fact that CockroachDB
is a distributed SQL database that provides better failure resilience and good scalability options. 
CockroachDB is a distributed database, which means we can use multiple nodes to store and write data.

In contrast, if we were to use a traditional SQL database like PostgreSQL, we would be limited to a single node,
and in order to ensure failure resilience we would need to implement mechanisms such as replication and sharding ourselves.
In the case of CockroachDB, these mechanisms are built in and can be utilized immediately, by setting up shared join configuration.

On practise it means that in the case of a node failure, CockroachDB replicas can continue operating despite
temporary performance degradation. This is particularly useful at this stage of the project, where no external orchestration
tools such as Kubernetes are used.

The tenant data sources are assumed to be externally provided datasets owned and managed by the tenants. As mentioned before, 
in this project, the data source is a Reddit comments dataset obtained from Kaggle. The platform is designed to serve big data workloads
characterized by large data volumes, high ingestion throughput, and concurrent access by multiple data producers and consumers.
As a real example, multiple ingestion processes may load different subsets of Reddit comments in parallel to reduce total
ingestion time, while analytical queries retrieve data by subreddit or time range to verify that ingestion
is progressing correctly and to enable early analysis of the data.

To access the tenant’s resources, I’m using the better-sqlite library. I chose this library explicitly because it allows
querying data row by row, which helps with formatting batches. The implementation can be found in the consumer and ingestor codebases.

The motivation for operating on the data can be broad. The following examples show why it is important to 
efficiently store and process the data used by the platform.
- To analyze subreddit activity and engagement trends over time (for example, for marketing or community analysis).
- To detect anomalies such as unexpected spikes or drops in comment volume.
- To support data validation, monitoring, and moderation-related use cases.
- To ensure reliable access to data under high load and partial system failures.

### 2. Platform architecture and component interactions

The platform consists of two main components: mysimbdp-coredms and mysimbdp-dataingest. In the code folder,
these components can be found under the directories db and ingest, respectively. The mysimbdp-coredms component is
implemented as a CockroachDB cluster consisting of three nodes (this number may change later). Its purpose is to
store and manage tenant data while ensuring fault tolerance.

At this stage, mysimbdp-dataingest is implemented as a TypeScript script that reads data from the tenant’s data source
and writes it into mysimbdp-coredms using a batching technique. The implementation assumes that the tenant’s data source
is provided as an SQLite database file. Further technical details of the ingestion
process are described in the implementation section.

At this stage of the assignment, orchestration tools such as Kubernetes or Docker Swarm are not used.
In a production environment, such tools would be essential. For example, if the dataset represented a small
subset of multiple terabytes of data ingested within a single month, the platform would be significantly more
vulnerable to failures during ingestion without orchestration support.

In this project, the data volume is relatively small (compared to the real data set), which makes Docker Compose
sufficient for deploying a multi-node database cluster. Nevertheless, orchestration is considered
a clear area for future improvement and part of the platform’s long-term evolution.

Another component that is not implemented at this stage is event-driven data ingestion. Such a component would
be useful in scenarios where data ingestion and data consumption are coordinated through events, for example by notifying
consumers about ingestion progress. For this project, a batch-oriented ingestion approach is sufficient,
and data consumers directly query the database after ingestion.


### 3. Fault tolerance and single point of failure

Currently, the platform’s fault tolerance is implemented at two layers. The primary layer is
the CockroachDB cluster itself. CockroachDB follows a consensus-based replication model that can be seen as
democratic decision process. Each data range has a leader replica and multiple follower replicas. The leader is
responsible for coordinating read and write operations and for replicating changes to the followers.

For any write operation to be committed, a quorum of replicas must agree on the operation. With a replication
factor of three, a quorum consists of two replicas. As a result, the database can tolerate the failure of a single
node while continuing to operate. If the failed node was the leader for a given range, leadership is automatically
reassigned to another replica. However, if two out of three nodes become unavailable, the database can no longer achieve
a quorum, and write operations are halted until at least one node is restored or a new node is added to the cluster.

In addition to the database-level fault tolerance, the second layer of fault tolerance is implemented at the ingestion
level. Ingest workers continuously attempt to write data to the database and include retry logic to handle transient
failures. When a write operation fails due to temporary issues such as leader election or node unavailability,
the ingest workers retry the operation using an exponential backoff strategy based on a 2ⁿ delay. After a predefined
maximum number of retries, the ingest process stops and reports a failure.

This implementation has definitely potential improvements. If the database remains unavailable for a longer period and the ingest
workers exhaust their retry attempts, both the database and the ingest processes must be restarted manually.
In production systems, orchestration tools such as Kubernetes would address the issue by automatically
restarting failed components and rescheduling workloads. In this platform, fault tolerance is therefore
provided at two levels: the database-level consensus and replication mechanism, and the application-level
retry logic implemented by the ingest workers.


### 4. Data replication and number of nodes

For mysimbdp-coredms, a replication factor of three is chosen as the predefined data replication level.
This means that each data range is stored as three replicas across different database nodes. This replication level
provides a balance between fault tolerance and resource overhead.

With a replication factor of three, CockroachDB requires a quorum of two replicas to commit write operations.
As a result, the system can tolerate the failure of a single data node while continuing to operate, thereby preventing
a single point of failure. To support this replication level, at least three data nodes are required in the cluster.

If two out of three nodes become unavailable, the cluster can no longer reach a quorum and write operations are halted
to preserve data consistency. This behavior is an intentional design choice that prioritizes strong consistency over
availability under multiple simultaneous failures.

### 5. Deployment assumptions for data ingestion

The platform is assumed to be hosted within a single data center environment where mysimbdp-coredms is
deployed as a multi-node cluster. Tenant data sources are assumed to be externally owned and made accessible to
mysimbdp-dataingest. In this implementation, tenant data is provided as a local SQLite database file.

The mysimbdp-dataingest component is deployed close to mysimbdpdp-coredms within the same network environment.
This placement minimizes network latency and improves write throughput during data ingestion, which is important for
large batch workloads. It is assumed that tenants can transfer their data to a location reachable by mysimbdp-dataingest.

The main advantage of this deployment is higher ingestion performance due to low-latency communication with the
database. A potential drawback is increased data transfer latency for tenants located far from the data center,
which could be addressed in future deployments by running mysimbdp-dataingest in multiple locations.
    
## Part 2 – Implementation

### 1. Tenant data schema

To implement the tenant schema, I used Flyway migrations to automate the process and make it easier for the reader to understand.

The tenant data schema is defined as a single table named ```comments```, which maps the structure of the source
data. The schema is designed as a single table with one row per comment to simplify
ingestion.

To ensure data consistency, I implemented a mapper in utils.ts. As mentioned in part 1's section 1, the stored data is
for analytics and monitoring purposes. Each comment is atomic and stored as a single row in the comments table in the database.
(Simplicity is prioritized).

I did not choose to implement a normalized schema, as normalization would increase
the complexity of the ingestion process by requiring inserts into multiple related tables. In addition, normalized
schemas would make analytical queries more expensive due to the need for joins across tables. Shortly, since the data is
intended for large-scale ingestion and analytical workloads, a denormalized schema was chosen to prioritize simplicity
and ingestion efficiency.

The schema is designed to capture both the content of a comment and its associated metadata. Each comment is uniquely
identified by the Reddit comment id, which is used as the primary key to prevent duplicate ingestion. Additional
fields store information about the subreddit, author, timestamps, and engagement metrics such as scores and upvotes.

### 2. Data partitioning and replication strategy

Partitioning and replication strategies are left to CockroachDB, as it is able to perform them efficiently at the
database layer. CockroachDB automatically partitions tables into key ranges based on the primary key and distributes
these ranges across available nodes. As data volume grows, ranges are split and rebalanced
without requiring changes in application logic.

Replication is handled at the same level by maintaining multiple replicas of each range according to the configured
replication factor. This allows data to be evenly distributed across nodes while providing fault tolerance and strong
consistency through quorum-based replication. By delegating partitioning and replication to CockroachDB, the platform
avoids manual sharding logic and benefits from scalable performance and resilience with minimal operational complexity.

As here I'm referring to the CockroachDB own characteristics, here is the resource, that I got an inspiration from.
https://www.cockroachlabs.com/blog/automated-rebalance-and-repair

### 3. Data ingestion design and consistency assumptions

Mysimbdp-dataingest is implemented as a TypeScript script that reads data from a tenant’s SQLite database within a
specified time range and writes it to the CockroachDB cluster in batches. To increase throughput and improve read
performance by avoiding join operations required in a normalized database, the design maps each row from the
source database directly to a single row in the target database. This process is validated through the mapper
function in utils.ts. Each data instance (row) consists of 22 columns, as described in Part 1.

Data ingestors can be executed in parallel, which is explained in root README.md

Data consistency in CockroachDB is ensured by its design, which prioritizes consistency over availability, as stated
in the official documentation. CockroachDB assumes that node clocks are loosely synchronized with a bounded clock
skew of up to 500 ms. Although clocks may drift within this bound, the system is designed to account for
this uncertainty and still provide strong consistency guarantees, ensuring correct and up-to-date reads across the cluster.

Documentation on multi-version concurrency control and clocks mentioned above:
https://www.cockroachlabs.com/docs/stable/architecture/storage-layer

### 4. Performance evaluation

To calculate performance metrics, I created a table called ingest_metrics, where I track each insertion batch along with
its timestamp, the number of rows inserted, and the batch latency. I use the same database for this purpose.

In other words, all metrics are written to the same CockroachDB cluster that is used for data ingestion. However, I do
not consider this a problem, since the volume of metrics data is small and write operations are infrequent, making this
workload trivial for CockroachDB to handle.

I will present the performance results in a table showing evaluations for 1, 5, and 10 ingest workers.
The metrics are: throughput, response time (Latency) and their 95/99 percentiles. 
All values will be averaged, as the goal is not to analyze individual ingestors but rather to evaluate the overall
write performance of the system.

I will also add graphs in my report, since I have added a configuration to Grafana to visualize the metrics data. I think
that visualization is the best way for us humans to understand the result and even though it is not mandatory, actually
for me, it was. So, please enjoy it too. Snapshots of the graphs are included in this folder. 

Please note that my configuration works in such a way that each worker is assigned a specific time range.
This is done to divide workers into intervals. As a result, when running with 1 or 5 workers, not all data is actually
written to the database. However, when using 10 workers, all data is ingested.

As an additional note, I run everything on my own machine with the following specs: macOS, Apple M3 Pro, 32 GB RAM.

| Ingest Workers | Avg. Throughput (rows/s) | Avg. Latency (ms) | P95 Latency (ms) | P99 Latency (ms) |
|----------------|--------------------------|-------------------|------------------|------------------|
| 1              | 10900                    | 37                | 163              | 333              |
| 5              | 29900                    | 67                | 89               | 400              |
| 10             | 40550                    | 85                | 148              | 206              |


Here I would like to add that I tested the setup by shutting down nodes and bringing them back up. Despite my
expectations that reassigning the hierarchy in the DB cluster would take time, especially toward the end of the insertion
process in the 10-ingestors case—this did not happen. There was a barely noticeable drop in performance, and it was not
sufficient to stop the database from operating. Bringing the node instance back online did not seem to affect the
situation either positively or negatively.


### 5. Data consumption and query performance

This part is actually what I am doing as the last item from the whole assignment list, and at this point I have to admit
a few things.

The reading speed is bad. As much as the ingestor ingests more and more data, the reading speed goes down faster
and faster. At first, I thought that some things were not that necessary, for example data normalization and better
architecture for the structure of the data I am storing. At this point in time, it is a bit too late to change the
structure of the database to get better performance, but I do have some ideas for that.

Before I dig into those ideas and further explanations, I would like to stop and take a look at what I have received
from Grafana. Please take a look at logs/5_consumers_yellow_5_ingestor_green.png. As the name states, the yellow line
is the reading throughput, and the green line is the writing throughput. If you take a look at
logs/5_ingestors_grafana.png, you will notice that the average writing speed is around 150k rows per 5 seconds when
there are no consumers, just pure writing. But when you take a look at the graph with consumers, you will notice that
the writing speed drops to around 65k rows per 5 seconds. The further the writing continues, the worse it becomes.
This is most likely due to the fact that reading is performed in parallel, and as the data grows, reading takes
more and more resources to complete.

As a context, my consumers are implemented in a way that they are finding 500 most popular subreddits by the amount of comments
and 500 newest comments from the database overall.

After around 10 minutes of writing into the database, the reading speed goes down to about 1000 rows per 5 seconds on average,
which is really bad, especially considering that at the very beginning the reading speed is even better than the writing speed.

This is happening because of a few reasons. First, since the data is replicated on 3 nodes and there is no sharding as
such by default, I am not distributing the data horizontally very well. Even though CockroachDB is applying ranging
and partitioning, it is simply not enough for such a big amount of data. The second, and one of the most important
reasons, is that the data is not normalized. I thought that normalization would be killing in our case and that
simplicity was the way to go, as it saves resources, but now I can definitely see that normalization is vital here.
For example, querying 500 most popular subreddits would be much faster if I had a separate table for subreddits,
including the comment count itself, or just a table that is updated on each insert with the subreddit name and a
counter of comments. Of course, this would slow down ingestion a bit, but it is a fair trade-off for avoiding a
situation where the reading speed is almost zero at the end.

The third reason is that I am not using any indexes at all. Adding indexes on the columns that are used for filtering
and sorting would definitely help here. I have tried adding an index on the subreddit column, and I can see a small
increase in speed, but it is still not sufficient. So, again it is about the design as a whole.

Overall, if I were to redesign and replan what I am doing right now, I would think much more precisely about the data
structure I have, about normalization and indexing. I would also think about the sharding strategy much more carefully.
Taking into account the trade-off in CockroachDB’s speed in order to provide consistency, these things are a must-have.


## Part 3 – Extensions

### 1. Data lineage metadata

As stated earlier, a table named ingest_metrics is implemented to record ingestion metadata for each batch, including
the ingestion timestamp, the number of rows inserted, the worker identifier, and the batch latency. This table serves
as a simple form of data lineage metadata, as it captures when data was ingested, how much data was ingested,
and basic performance characteristics of the ingestion process. Since the current deployment does not
involve geographically distributed nodes or multiple ingestion locations, location-based lineage metadata is not included.

Also, I see it useful that I included worker id tracking for each write operation. For instance, it would enable
identifying ingestion workers that produce high-latency batches or experience frequent failures, allowing
their logging, alerting, and using load balancing techniques based on the log/historical data.

Also, I see it worth to mention that the current lineage implementation focuses mostly on ingestion-time metadata 
and does not explicitly store source identifiers
or dataset versions, as the platform assumes a single well-defined data source in this deployment (see part 1) . 
However, this can be
extended in future implementations depending on tenant requirements. For example, adding a ```source_id``` column to the
```comments``` table would allow each ingested comment to be associated with its original data source. This would enable
basic data provenance tracking, making it possible to trace records back to their source dataset and for example support
scenarios where a single tenant ingests data from multiple sources.

### 2. Service and data discovery

For example, the registry can store entries keyed by tenant identifier, with values
containing the database name, cluster endpoints, and configuration details.

Example logical schema stored in the registry could be:

```
key: mysimbdp/tenants/{tenant_id} ---> 

value:
{
"database_name": "reddit",
"db_hosts": ["cockroach-1:26257", "cockroach-2:26257", "cockroach-3:26257"],
"replication_factor": 3
}
```
### 3. Integrating discovery into data ingestion

First of all, the current Docker Compose setup would no longer need to be updated manually. At the moment, there are
ten ingest workers, and I do not want to lie that this is a good approach. Every time I want to test with a different number of workers,
I need to update the Compose file or change startup parameters manually. If there is a change in database
specifications, the configuration also has to be updated manually.

If service discovery were implemented, instead of using hardcoded database connection information, mysimbdp-dataingest
instances would first query a service registry, such as Redis or ZooKeeper. The query would be performed based on the
tenant identifier. This approach can be supported by the service and data discovery schema described in the previous section,
allowing each tenant to discover exactly where their data should be stored.

The second change would be to modify the current worker ID–based time range assignment. Instead of statically caluclate
time ranges to ingest workers based on ids, another entry in the service registry would be introduced and managed by the platform.
This entry would contain time ranges that have not yet been ingested. Each mysimbdp-dataingest instance would first
query this registry to obtain the next time range to ingest, and after finishing ingestion of that range, it would
update the registry to mark the range as processed and then request the next available range.

Example of such as registry entry:
```
Key: mysimbdp/tenants/tenantA/ingestion
Value:
{
  "time_range_start": 1430438400,
  "time_range_end": 1433116799,
}
```



### 4. Introducing mysimbdp-daas

If we were to introduce the mysimbdp-daas component, it would mean that ingestors and consumers would no longer connect
directly to the database, but would instead interact through an intermediate layer. mysimbdp-daas would allow balancing
load between multiple database clusters and would also provide a stronger security layer, since direct access to the
database would be restricted. At the same time, this approach would introduce additional latency and maintenance overhead.

Shifting the architecture to a DaaS model means that a service is placed between data producers/consumers and the database.
Communication through mysimbdp-daas would be based on defined API specifications. Ingestors and readers would send requests
to mysimbdp-daas, which would process them, validate the data, and forward the requests to mysimbdp-coredms in an appropriate
way (for example authorization params and data batches). mysimbdp-daas could potentially manage multiple database clusters
behind it and route requests based on load, time of day, or other parameters, removing this responsibility from producers
and consumers. This approach reduces the need for direct service and data discovery in mysimbdp-dataingest, since all
communication would be handled through the DaaS layer, while service discovery would still be required internally by mysimbdp-daas.

An additional aspect that comes to mind is that with a DaaS layer, it could be easier to record and manage lineage data.
For example, lineage metadata could be written through the same API but stored in a separate database or cluster, avoiding
additional load on the primary data storage while still maintaining traceability of ingestion operations.


The schema would look something like this:

```
Tenant data source
        |
        v
 mysimbdp-dataingest
        |
        v
   mysimbdp-daas <------- Consumers
        |
        v
 mysimbdp-coredms
```

### 5. Hot and cold data management

First of all, I would not use the same database to store both hot and cold data. Over time, cold data would continuously
grow and dominate the hot data, which would make operations on hot data significantly slower. This is especially important
in the context of a platform that may receive dozens of terabytes of data per month, (or even petabytes nowdays).
For this reason, I would store hot data and cold data separately.

To achieve this, I would create two tables. In my case, I assume that hot data is data that is one week old or less,
while cold data represents historical data. Another type of hot data could be related to a specific subreddit or an explicit
topic that is of particular interest for analytics. To support this, I would add a column indicating the type of hotness,
with a predefined marker like time-based hotness or topic-based hotness.

Tenants would be able to mark how hot the data is for each row if needed. By default, however, any data older than one
week would be considered cold.

To move data from the hot table to the cold table, I do not think there is a need to overengineer the solution.
A simple background job could periodically process the hot table and move data that is older than one week, or no longer
marked as hot, from the hot table into the cold table.

I also see a clear sign of the benefit from caching mechanisms in this setup. For example, an additional caching layer, which is not
part of mysimbdp-coredms itself, could be introduced using Redis. This cache could store the most frequently accessed
comments, such as comments from the last hour or comments with a high hotness score. The cache could be refreshed
periodically, for example every 15 minutes. Considering that the hot data table may still grow to very large sizes,
a Redis-based cache could significantly reduce load on the database and act as a strong performance booster for analytical workloads.

Although CockroachDB provides strong consistency guarantees, logical inconsistencies may occur at the application level
during data movement between hot and cold tables. For example, queries that only access hot data may temporarily miss
records that have already been moved to cold storage, and cached results may briefly lag behind the database state.
However those are not critical things for analytics, as analytics are usually built over a long time period, which
means that to mitigate the problem we just need some time.
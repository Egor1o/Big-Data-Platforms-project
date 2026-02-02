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
is progressing correctly and to enable early exploratory analysis of the data.

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

(TODO)

### 3. Integrating discovery into data ingestion

(TODO)

### 4. Introducing mysimbdp-daas

(TODO)

### 5. Hot and cold data management

(TODO)

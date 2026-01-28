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

(TODO)

### 4. Data replication and number of nodes

(TODO)

### 5. Deployment assumptions for data ingestion

(TODO)

## Part 2 – Implementation

### 1. Tenant data schema

(TODO)

### 2. Data partitioning and replication strategy

(TODO)

### 3. Data ingestion design and consistency assumptions

(TODO)

### 4. Performance evaluation

(TODO)

### 5. Data consumption and query performance

(TODO)

## Part 3 – Extensions

### 1. Data lineage metadata

(TODO)

### 2. Service and data discovery

(TODO)

### 3. Integrating discovery into data ingestion

(TODO)

### 4. Introducing mysimbdp-daas

(TODO)

### 5. Hot and cold data management

(TODO)

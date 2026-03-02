# Assignment 2 – Working on Data Ingestion and Transformation

## Part 1 – Streaming Data Ingestion

### 1. Near real-time ingestion design and multi-tenancy model

For this assignment, I use the same Reddit dataset as in Assignment 1 and split it into two non-overlapping parts
by time boundary at the middle of May 2015. Tenant A ingests data from May 1–15, while Tenant B ingests data from
May 16–31. This guarantees that the two tenants do not share any records while still allowing reuse of the original dataset.

The system works in the following way. There is an ingest manager component that is responsible for starting and stopping
ingestion workers on demand. The first step is that tenants provide their implementation of the `worker`,
which is executed and controlled on the mysimbdp side. For each tenant, there is a dedicated folder
`tenants/tenant-<index>` in the repository from which the ingestion worker is executed.

At the moment, tenants are added manually, but in the future it would be possible to introduce a database
table where tenants can register and request a specific number of ingestion worker replicas.

Tenants send their original data via a messaging system for ingestion as bronze data from their perspective.
The messaging system, `mysimbdp-messagingsystem`, is provisioned and managed by mysimbdp and is implemented
using Apache Kafka. Each tenant has a dedicated Kafka topic named `tenant<index>-bronze` for simplicity.
In the future, the naming convention could be extended to support more flexible topic structures if a tenant
required multiple ingestion streams like `tenant<index>-<topic>-bronze`.

Tenants are responsible for defining the structure of the messages they send to Kafka. The stream ingest worker `worker`
reads these messages from the corresponding topic, validates their structure, and maps them to the database schema
before inserting them into `mysimbdp-coredms`. The worker ensures that only valid data is stored in bronze storage, because
we should not ever believe the producer.

From a multi-tenancy perspective, the messaging infrastructure, the CockroachDB cluster `mysimbdp-coredms`, the ingest
manager, and the monitoring components are shared among all tenants. On the other hand, Kafka topics, ingestion worker
instances, and bronze storage structures are logically isolated per tenant. This design allows mysimbdp to add
or remove tenants without affecting others.

The pay-per-use principle is supported by controlling the number of ingestion worker replicas allocated to each tenant.
Tenants with higher ingestion requirements can be assigned more workers, while smaller tenants can operate with fewer
resources. Pay-per-use is enforced by the manager, which monitors the workload and determines whether it exceeds a
predefined threshold. These thresholds can be defined as part of the tenant’s service agreement. Even if the tenant
is an internal user, resource allocation still reflects actual usage. In the case of external commercial tenants,
resource consumption would directly correspond to billing, since tenants effectively pay for the resources they use.

### 2. Design and implementation of mysimbdp-streamingestmanager

### 3. Implementation of streamingestworker for multiple tenants and performance evaluation

### 4. Observability and reporting with mysimbdp-streamingestmonitor

### 5. Adaptive management and scaling based on monitoring


## Part 2 – Silver Data Transformation with Batch Processing

### 1. Service agreement constraints for tenant pipelines

### 2. Design and implementation of silverpipeline

### 3. Design and implementation of mysimbdp-batchmanager

### 4. Testing, constraint validation, and performance evaluation

### 5. Logging and observability for silver data transformation


## Part 3 – Integration and Extension

### 1. Integrated architecture for logging and monitoring

### 2. Supporting multiple data sinks in streaming ingestion

### 3. Data quality detection and management in near real-time ingestion

### 4. Supporting multiple silver pipelines per tenant

### 5. Redesigning complex silver pipelines for performance and fault tolerance
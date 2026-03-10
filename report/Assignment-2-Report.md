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
Manager service is implemented as a Node.js script, which defined `scaleWorkers` function.
The function can be triggered through a Kafka topic called `manager-control`. In a real-world scenario, I would rather
introduce an API with proper authorization and a database layer that stores tenant information, including the allowed
number of replicas and the thresholds for scaling up or down.

In my current implementation, when the manager is started, there is a hardcoded configuration for tenants A and B.
In this configuration, the topic name, minimum number of workers, and maximum number of workers are defined. The manager
stores the current number of workers in memory, more precisely in the `currentWorkers` variable, which is a map of tenant
name to the number of active workers. In a real-world system, this would normally be handled by a proper orchestration
platform such as Kubernetes, but for this assignment I assume my implementation is sufficient.

The scaling functionality of the manager is implemented in a blackbox manner by executing shell commands that increase
or decrease the number of replicas for the corresponding tenant worker service. The manager does not need to know anything
about the internal logic of the worker, as long as the worker follows the required contract (environment variables,
topic naming, graceful shutdown, etc.). For simplicity, this component is executed outside of Docker, since running
it inside a container would require additional Docker-in-Docker configuration.

Thresholds as said before would be best to place as a field in a tenant-related database, but in my case I define it
on the manager level already. 

By default I configured manager so that it can be used as a starting point of the application that starts 1 worker for
each tenant, and further just listens for the monitor service.

In order for a tenant to develop a streamingestworker compatible with mysimbdp-streamingestmanager, the worker must follow
a predefined contract. It must rely on environment variables for configuration (such as `TENANT_ID` and `DATABASE_URL`),
listen to the correct Kafka topic following the platform naming convention, and periodically send ingestion metrics to the monitoring topic.

Additionally, the worker must support graceful shutdown and remain stateless (except for Kafka-managed offsets) so that
scaling up or down does not cause inconsistencies. By following this contract, the manager can treat the worker as a blackbox
component.


### 3. Implementation of streamingestworker for multiple tenants and performance evaluation
Even though I have already implemented the monitoring system and the manager, I will test the system without the manager
and instead use manually launched workers. I am doing this because I assume that, at this stage of the task, the monitor
has not yet been implemented.

I would also like to clarify that I will not include producer latency or the time it takes for the topic to deliver a
message to the consumer. Instead, I will measure the raw insertion time over a 10-second period, since each worker
reports the work completed during that interval and I start them on the same moment. The reason for the 10 second period
time can be found in 1.4.

There is no major difference in the way tenant-b and tenant-a workers are implemented. Both map the entire row received
from the producer and, every 10 seconds, notify the monitor about the completion of their operations. In practice,
the monitoring system is the component that stores the ingestion metrics. I do not see any significant overhead in
this communication design, since the metrics topic is extremely small compared to the topics from which the workers
consume ingestion data.

The results are quite interesting. According to the data, a single ingestor performs better than ten ingestors
running at the same time, which indicates some improper planning of the system. After looking deeper into how Kafka works,
I observed something important about the consumer model. A consumer group, which is a group of consumers assigned
to the same topic, distributes partitions in such a way that each partition can be consumed by only one consumer
at a time. This guarantees ordering of message offsets within a partition. However, a consumer can be assigned
to multiple partitions.

In my tests with 10 workers, the topic had only 5 partitions. This means the consumer group manager could assign only 5
workers to actively consume messages at any given time. The remaining workers would remain idle. Therefore, if a bottleneck
occurs within a partition, one worker may effectively become blocked. On the other hand, when there is only one worker
and five partitions, that single worker can process multiple partitions concurrently. In this scenario, a blocked partition
does not affect the overall system as significantly. I believe this is the main reason why one worker outperformed ten
workers in my tests.

I have also tested the approach with 10 workers and 30 partitions, additionally adding two replicas of each producer.
However, I did not observe any significant improvement or degradation in performance. This indicates that the bottleneck
is much more likely located in the database layer and related to the issues discussed in the first assignment, rather
than in the Kafka consumer model.

Just to mention, since I use quite similar logic like one in the first assignment, I haven't observed any failures and exceptions
during ingestion or producing process.

| Tenant     | Ingest Workers | Avg. Throughput (rows/s) | Avg. Throughput (bytes/s)   | Avg. Latency (ms) | P95 Latency (ms) | P99 Latency (ms) |
|------------|----------------|--------------------------|-----------------------------|-------------------|------------------|------------------|
| tenant-a   | 1              | 40809                    | 24711461                    | 8.6               | 115.7            | 110.3            |
| tenant-a   | 10             | 32161                    | 19474645                    | 83.0              | 497.1            | 1297.5           |
| tenant-b   | 1              | 36801                    | 22361587                    | 9.8               | 120.3            | 130.3            |
| tenant-b   | 10             | 31944                    | 19392173                    | 71.4              | 380.8            | 1028.7           |



### 4. Observability and reporting with mysimbdp-streamingestmonitor
For monitoring purposes, I created a dedicated migration `V5__platform-monitoring` which defines the table `ingest_metrics`
in the `mysimbdp_platform` database. The table stores tenant id, worker id, timestamp, number of processed records,
total ingestion size in bytes, and average batch latency in milliseconds.

The report format is a structured JSON message containing: tenant_id, worker_id, timestamp, rows_inserted, ingestion_bytes,
and avg_batch_latency_ms. All fields in JSON have the same names as ones above. For the types you can refer to the `ingest_metrics` table schema.

Each streamingestworker aggregates its performance metrics over a fixed interval (10 seconds). During this period, it counts
how many records were processed, sums the size of all consumed Kafka messages in bytes, and computes the average latency
of batch inserts. Instead of reporting every operation, the worker sends one composed metrics message per interval, which
is a good approach as it does not overwhelm metrics db table.

The metrics are published to a dedicated Kafka topic (`metrics`). The mysimbdp-streamingestmonitor consumes these messages
and stores them in the monitoring `ingest_metrics` table. This way, workers stay lightweight and decoupled from the monitoring database,
and the monitor acts as the observability component of the platform.

### 5. Adaptive management and scaling based on monitoring
As mentioned before, the monitor receives metrics reports from streamingestworker through the `metrics` Kafka topic.
Each report contains aggregated information about the worker performance.

The mysimbdp-streamingestmonitor evaluates these metrics against predefined thresholds. If the average ingestion
time exceeds or drops below the defined limits, the monitor decides which action should be taken (scale_up or scale_down).
It then publishes a message to the `manager-control` Kafka topic containing the tenant id and the requested action.

The mysimbdp-streamingestmanager subscribes to the `manager-control` topic and reacts to these messages. Based on the
received action, it adjusts the number of worker replicas for the corresponding tenant. The manager enforces boundaries
defined in its configuration - never scales below one worker per tenant and never goes over the maximum number of replicas
specified in the config.

These are the logs from manager and monitoring system demonstrating workflow depended on the workload. Scaling up on demand
and down when not needed anymore. Scaling is dependent on the latency of ingestion process and can be fixed

```logs
Logs from manager:

Managing tenants: [ 'tenant-a', 'tenant-b' ]
Scaling tenant-a to 1 workers
Scaling tenant-b to 1 workers
{"level":"INFO","timestamp":"2026-03-10T13:04:11.316Z","logger":"kafkajs","message":"[Consumer] Starting","groupId":"manager-group"}
{"level":"INFO","timestamp":"2026-03-10T13:04:14.366Z","logger":"kafkajs","message":"[ConsumerGroup] Consumer has joined the group","groupId":"manager-group","memberId":"kafkajs-54d1e7bb-4416-4dd8-8747-c480aa5c3604","leaderId":"kafkajs-54d1e7bb-4416-4dd8-8747-c480aa5c3604","isLeader":true,"memberAssignment":{"manager-control":[0]},"groupProtocol":"RoundRobinAssigner","duration":3048}
tenant-a at minimum workers, not scaling down
tenant-b at minimum workers, not scaling down
tenant-a at minimum workers, not scaling down
Scaling tenant-b to 2 workers
Scaling tenant-a to 2 workers
Scaling tenant-b to 3 workers
Scaling tenant-b to 4 workers
Scaling tenant-a to 3 workers
Scaling tenant-a to 4 workers
tenant-b already at max workers
tenant-b already at max workers
tenant-b already at max workers
tenant-b already at max workers
Scaling tenant-a to 5 workers
tenant-a already at max workers
tenant-a already at max workers
Scaling tenant-b to 3 workers
tenant-a already at max workers
tenant-a already at max workers
Scaling tenant-b to 2 workers
tenant-a already at max workers
tenant-a already at max workers
tenant-a already at max workers
tenant-a already at max workers
tenant-a already at max workers
tenant-a already at max workers
tenant-a already at max workers
tenant-a already at max workers
...
Scaling tenant-b to 3 workers
tenant-a already at max workers
tenant-a already at max workers
Scaling tenant-b to 4 workers
Scaling tenant-b to 3 workers
Scaling tenant-b to 2 workers
Scaling tenant-b to 1 workers
tenant-b at minimum workers, not scaling down
tenant-b at minimum workers, not scaling down
tenant-b at minimum workers, not scaling down
tenant-b at minimum workers, not scaling down
tenant-a already at max workers
tenant-a already at max workers
tenant-a already at max workers
tenant-b at minimum workers, not scaling down
tenant-a already at max workers
tenant-a already at max workers
Scaling tenant-a to 4 workers
Scaling tenant-a to 3 workers
Scaling tenant-a to 2 workers

Logs from monitoring system:

stream-ingest-monitor-1  | Manager notified: tenant-b → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-b (7f2aefa61e20)
stream-ingest-monitor-1  | Manager notified: tenant-b → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-b (12c290358cce)
stream-ingest-monitor-1  | Metrics stored for tenant-a (ac7122355095)
stream-ingest-monitor-1  | Metrics stored for tenant-a (a42d8bccc9ea)
stream-ingest-monitor-1  | Metrics stored for tenant-a (b4372939b77e)
stream-ingest-monitor-1  | Metrics stored for tenant-b (962df081704b)
stream-ingest-monitor-1  | Manager notified: tenant-b → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-a (669cdd636ea7)
stream-ingest-monitor-1  | Metrics stored for tenant-a (e553c6d40521)
stream-ingest-monitor-1  | Metrics stored for tenant-b (12c290358cce)
stream-ingest-monitor-1  | Manager notified: tenant-b → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-a (ac7122355095)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_up
stream-ingest-monitor-1  | Metrics stored for tenant-a (a42d8bccc9ea)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_up
stream-ingest-monitor-1  | Metrics stored for tenant-a (b4372939b77e)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_up
stream-ingest-monitor-1  | Metrics stored for tenant-b (962df081704b)
stream-ingest-monitor-1  | Manager notified: tenant-b → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-a (669cdd636ea7)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_up
stream-ingest-monitor-1  | Metrics stored for tenant-a (e553c6d40521)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_up
stream-ingest-monitor-1  | Metrics stored for tenant-a (ac7122355095)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-a (669cdd636ea7)
stream-ingest-monitor-1  | Metrics stored for tenant-a (a42d8bccc9ea)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-a (b4372939b77e)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-b (962df081704b)
stream-ingest-monitor-1  | Manager notified: tenant-b → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-a (669cdd636ea7)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-a (e553c6d40521)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-a (e553c6d40521)
stream-ingest-monitor-1  | Metrics stored for tenant-a (b4372939b77e)
stream-ingest-monitor-1  | Metrics stored for tenant-a (a42d8bccc9ea)
stream-ingest-monitor-1  | Metrics stored for tenant-a (ac7122355095)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-a (a42d8bccc9ea)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-b (962df081704b)
stream-ingest-monitor-1  | Manager notified: tenant-b → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-a (ac7122355095)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-b (962df081704b)
stream-ingest-monitor-1  | Manager notified: tenant-b → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-a (ac7122355095)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-b (962df081704b)
stream-ingest-monitor-1  | Manager notified: tenant-b → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-a (ac7122355095)
stream-ingest-monitor-1  | Manager notified: tenant-a → scale_down
stream-ingest-monitor-1  | Metrics stored for tenant-b (962df081704b)
stream-ingest-monitor-1  | Manager notified: tenant-b → scale_down


```

## Part 2 – Silver Data Transformation with Batch Processing

### 1. Service agreement constraints for tenant pipelines
From the bronze layer, tenants design their **own silver transformation pipelines**. These pipelines read bronze tables
and generate processed, analytics-ready silver tables. Since multiple tenants share the same infrastructure, mysimbdp
must enforce a set of service agreement constraints to prevent one tenant from exhausting platform resources.

The platform supports the following constraint schema for silver pipelines:

- `max_execution_time_seconds` – maximum allowed runtime of a single pipeline execution. If exceeded, the pipeline process is terminated.
- `max_memory_mb` – memory limit for the pipeline process (not implemented in this assignment to avoid overcomplication, but included in the design as a required production-level constraint).
- `max_parallel_pipelines` – maximum number of concurrent silver pipelines allowed per tenant.
- `max_input_rows` – maximum number of bronze rows that can be processed in a single run.
- `max_retries` – maximum number of retry attempts in case of pipeline failure.
- `backoff_seconds` – waiting time before retrying after a failed execution.

These constraints are validated and enforced by `mysimbdp-batchmanager` before invoking a tenant’s silver pipeline.
If a pipeline violates its agreement (for example exceeds execution time or parallel execution limit), execution is
either rejected or forcibly terminated.

Silver pipelines may perform heavy aggregations such as grouping by subreddit and computing statistical
metrics. Without limits, one tenant could consume excessive CPU, memory, or database resources, negatively affecting
other tenants and degrading overall platform performance.

Below are two example tenant configurations:

### Tenant A

```json
{
  "tenant_id": "tenant-a",
  "max_execution_time_seconds": 600,
  // "max_memory_mb": 2048,
  "max_parallel_pipelines": 2,
  "max_input_rows": 1000000,
  "max_retries": 3,
  "backoff_seconds": 10
}
```

### Tenant B

```json 
{
"tenant_id": "tenant-b",
"max_execution_time_seconds": 300, 
  // "max_memory_mb": 1024,
"max_parallel_pipelines": 1,
"max_input_rows": 500000,
"max_retries": 2,
"backoff_seconds": 5
}
```

### 2. Design and implementation of silverpipeline
Pipeline are caching data in files marked with the timestamp in the form `batch-<timestamp>.json`. Each caching
directory belongs to the tenant space and is logically isolated from other tenants. The pipeline reads data from the
bronze table in batches, limited by `max_input_rows`, and writes the extracted rows into a JSON file inside the
tenant’s caching directory.

After the extraction phase is completed and the batch file is written, the pipeline reads the data back from the cached
file and performs tenant-specific transformation logic on the file contents. This ensures that transformation is
decoupled from direct bronze database queries and simulates a more realistic batch-processing architecture.

The pipeline always saves the identifier of the last processed bronze row in the `silver_pipeline_state` table.
This checkpoint mechanism allows the pipeline to resume from the last successfully processed record in case of failure.
Additionally, since the extracted batch is stored as a JSON file, if the silver pipeline fails, it can be rerun using
the cached batch. This also makes it possible to inspect problematic batches during debugging.

For the tenant-a implementation, the pipeline collects engagement metrics per subreddit, such as total comments,
total ups, total downs, average score, and engagement ratio. For tenant-b, the pipeline analyzes controversy by
subreddit, calculating the total number of controversial comments and the average controversiality value.

This design satisfies the requirement that silverpipeline extracts bronze data, stores intermediate results in
tenant-caching-dir, transforms cached data, and produces silver outputs while operating under platform-controlled execution.

### 3. Design and implementation of mysimbdp-batchmanager
Batchmanager is indeed a black-box launcher in the full meaning of this word. It is implemented as a continuously running
service that periodically attempts to execute tenant silver pipelines. The configuration for tenants is currently
hardcoded in the manager as a simple object that defines the maximum number of parallel pipeline executions per tenant.
In a more advanced implementation, this configuration could be stored in a database and dynamically managed, but for the
purposes of this assignment a static configuration is sufficient.

Batch manager maintains in-memory state that tracks the number of currently running pipelines per tenant. Before launching
a new pipeline, it checks whether the number of running pipelines has reached the configured `max_parallel_runs` limit.
If the limit has not been reached, the manager executes the corresponding silver pipeline as a separate process using
Docker Compose. If the limit has already been reached, it logs a message indicating that the maximum number of parallel
pipelines has been reached and skips execution for that tenant.

The silver pipelines are treated strictly as blackbox executables. The batch manager does not inspect or interact with
their internal logic. It simply starts the pipeline container and waits for it to finish. The pipeline itself is
responsible for exiting with the appropriate status code, allowing the manager to determine whether
execution was successful or failed.

Scheduling is implemented using a simple interval-based mechanism. Every 10 seconds, the batch manager iterates over the
configured tenants and attempts to launch their silver pipelines. If there is no new bronze data to process, the pipeline
exits immediately after performing its internal checks.

The enforcement of constraints is divided between the batch manager and the pipeline. The batch manager enforces the
`max_parallel_runs` constraint and controls when pipelines are launched. Execution time limits and retry policies are
validated inside the pipeline implementation itself.

While this design is simplified and does not include advanced features such as dynamic resource monitoring, priority
queues, or CPU and memory tracking, it is sufficient to demonstrate the concept of a batch manager and its role in
coordinating tenant-specific silver pipelines within a multi-tenant big data platform.

### 4. Testing, constraint validation, and performance evaluation
Since I am using predefined datasets for both tenants, this can be considered realistic test data. For basic testing
purposes, mostly to verify that the project is up and running correctly, I provide a `sample.sql` file containing a
few megabytes of data. This allows quick validation of the system. But besides that, I perform testing on the original
dataset of approximately 30 GB of Reddit comments in order to evaluate performance under heavy workload.

Based on the constraints defined in section 2.1, there are several situations in which the silver pipeline will not be
executed. The first case is when the maximum number of allowed parallel silver pipelines for a tenant has already been
reached. In this case, the batch manager skips execution. The second situation occurs when the processing time exceeds
the allowed execution time - in such a case, the pipeline is terminated according to its constraint configuration.
The third case is when a tenant is not registered in the system. Currently tenants are hardcoded, but in a proper
production design this would be handled through a dynamic registration mechanism.

Additionally, I have introduced a CPU load check to ensure that the system load remains below a defined threshold before
launching a silver pipeline. The goal is to prevent the system from becoming overloaded and to always leave some capacity
for monitoring and management components, especially since in my setup all components run in the same environment.
I monitor the load ratio relative to total core capacity. If the load ratio is greater than 1, it means that, on average,
each core is overloaded, a value of 2.0 shows huge overload. Therefore, I allow silver pipeline execution
only when the load ratio is below 1.2, otherwise, execution is rejected.

Regarding storage performance, tests were performed using local disk for `tenant-caching-dir`, which provides fast file
read/write and lower execution time. Since the batch files are written and read immediately during transformation, local disk
minimizes latency and allows the pipeline to process large batches efficiently, even though
the trade-off is usage of the system space and resources.

In contrast, using cloud storage introduces additional network latency and variability in response time. Every write
and read operation must go through the network stack, which increases overall pipeline duration. This effect becomes
more noticeable with larger batch sizes, since bigger JSON files require more time to upload and download.

From an architectural perspective, cloud storage provides better scalability and durability, especially in distributed
deployments where compute nodes may not share the same filesystem. However, it comes at the cost of increased latency.
Therefore, the choice between local disk and cloud storage depends on the trade-off between performance and scalability.
In my local setup, where all components run in the same environment, local disk clearly is simplier and better option.

| Tenant   | Total Runs | Total Rows Processed | Avg Duration (ms) | P95 Duration (ms) | P99 Duration (ms) |
|-----------|------------|----------------------|-------------------|-------------------|-----------------|
| tenant-a  | 29         | 26346000             | 24600             | 61000             |71700            |
| tenant-b  | 57         | 27156500             | 16500             | 42000             |57000            |

### 5. Logging and observability for silver data transformation
For the logs, I have added the `silver_pipeline_logs` table into the metrics-specific database `mysimbdp_platform`.
This was done in order not to mix tenant-specific data with silver pipeline metrics. As required in the task, the logs
stored for the pipeline operations contain the start and end time, duration of execution, size of the processed batch
(rows_processed), pipeline name together with the tenant id, and the status of the operation.

mysimbdp could use this information in several ways. First of all, it can be used for monitoring and detecting bottlenecks,
as performance can be connected to specific tenants. Some tenants may require more processing capacity, and this
monitoring data can support such decisions.

Since both successful and failed executions are stored, and as mentioned in 2.4 batches are cached by execution time, it
is always possible to locate a failed cached batch in JSON format. Because the cached data is human-readable, it can be
directly used for debugging and investigation.

For analytics, this information is also important. It allows evaluation of how expensive certain transformations are and
how large the processed data volumes are per tenant. By aggregating the logged durations and processed rows (as shown
in the table bellow), it is possible to derive simple statistics for individual tenants and for the whole platform,
such as average execution time and total processed rows.

Below are examples of collected logs.

| ID                                   | Tenant    | Pipeline                 | Started At                  | Finished At                 | Duration (ms) | Rows Processed | Status  |
|---------------------------------------|-----------|--------------------------|-----------------------------|-----------------------------|---------------|----------------|---------|
| 0f1e9d73-8a94-4e38-9122-416071313b69 | tenant-b  | tenant-b-controversy     | 2026-03-10 10:42:30.627+00 | 2026-03-10 10:43:09.775+00 | 39,148        | 500,000        | SUCCESS |
| 12a5c2f8-43c4-4af7-9b5d-b386463c2c66 | tenant-a  | tenant-a-engagement      | 2026-03-10 10:41:30.53+00  | 2026-03-10 10:42:39.025+00 | 68,495        | 1,000,000      | SUCCESS |
| 1945ec81-bff0-431d-bbd7-9ace9b48f12d | tenant-a  | tenant-a-engagement      | 2026-03-10 10:40:10.77+00  | 2026-03-10 10:41:23.68+00  | 72,910        | 1,000,000      | SUCCESS |
| 1ba609e5-ed72-4980-ac8c-1407f2f56ed6 | tenant-a  | tenant-a-engagement      | 2026-03-10 10:42:40.281+00 | 2026-03-10 10:43:25.936+00 | 45,655        | 1,000,000      | SUCCESS |
| 1e93ada0-5204-4a23-83ce-f6eb2bc18b94 | tenant-b  | tenant-b-controversy     | 2026-03-10 10:43:20.334+00 | 2026-03-10 10:43:39.984+00 | 19,650        | 500,000        | SUCCESS |
| 3a1f440f-8a09-41b0-ac27-e0806174e803 | tenant-a  | tenant-a-engagement      | 2026-03-10 10:27:51.291+00 | 2026-03-10 10:27:51.317+00 | 26            | 0              | SUCCESS |
| 45f251ab-db7b-4d51-9fd1-b82031f11db9 | tenant-b  | tenant-b-controversy     | 2026-03-10 10:35:03.325+00 | 2026-03-10 10:35:59.035+00 | 55,710        | 500,000        | SUCCESS |
| 4d7d9144-f2de-44df-a1ec-283cd5167e34 | tenant-b  | tenant-b-controversy     | 2026-03-10 10:43:50.198+00 | 2026-03-10 10:44:08.68+00  | 18,482        | 500,000        | SUCCESS |
| 4ec2a7af-010f-453a-8e5c-7de88e30f03a | tenant-a  | tenant-a-engagement      | 2026-03-10 10:37:06.353+00 | 2026-03-10 10:37:43.25+00  | 36,897        | 1,000,000      | SUCCESS |
| 828f1429-1952-4dd1-8af0-069788f8b958 | tenant-a  | tenant-a-engagement      | 2026-03-10 10:43:30.233+00 | 2026-03-10 10:43:53.667+00 | 23,434        | 1,000,000      | SUCCESS |
| b4fddb72-1c10-44fc-8a17-07e2a03b975f | tenant-b  | tenant-b-controversy     | 2026-03-10 10:28:11.269+00 | 2026-03-10 10:28:11.281+00 | 12            | 0              | SUCCESS |
| ede273b6-cd66-47d8-b169-56711dc3de59 | tenant-b  | tenant-b-controversy     | 2026-03-10 10:41:25.004+00 | 2026-03-10 10:42:22.717+00 | 57,713        | 500,000        | SUCCESS |
| f817cf94-f2b2-4f7b-bd83-39c19a638dfc | tenant-b  | tenant-b-controversy     | 2026-03-10 10:40:30.413+00 | 2026-03-10 10:41:23.506+00 | 53,093        | 500,000        | SUCCESS |

## Part 3 – Integration and Extension

### 1. Integrated architecture for logging and monitoring

The system starts from Producers (tenants A and B), which generate data and send it to Kafka topics (`tenant-<index>-bronze`).
Each tenant has its own dedicated bronze topic. Tenant-specific workers consume messages from Kafka and write validated
data into tenant bronze tables.

During ingestion, each streamingestworker aggregates performance metrics over a fixed interval (10 seconds).
These metrics include number of processed rows, total bytes, and average batch latency. The worker sends this
report to a Kafka monitoring queue. The monitoring system consumes these messages and stores them in the
`ingest_metrics` table in the `mysimbdp_platform` database. Based on these metrics, scaling requests can be
generated and sent to the manager via a dedicated Kafka scaling queue. The manager consumes these requests and
scales ingestion workers accordingly.

For the batch layer, the mysimbdp-batchmanager periodically triggers tenant-specific silver pipelines. Each silver
pipeline reads data from the tenant bronze table using the last processed id, extracts a batch, caches it in
`tenant-caching-dir`, performs transformation, and writes the processed results into the tenant silver tables.

After each execution, the silver pipeline reports its run metadata (start time, finish time, duration, rows processed,
execution status, error if any) into the `silver_pipeline_logs` table inside the same `mysimbdp_platform` database.
This keeps transformation metrics separated from tenant business data while still allowing centralized monitoring.

From the platform provider’s perspective, the amount of data ingested per tenant can be obtained by aggregating
`rows_inserted` and `ingestion_bytes` from the `ingest_metrics` table. Performance metrics such as average latency,
P95 and P99 percentiles are calculated directly using SQL queries.

Similarly, the amount of data processed during silver transformation is obtained from `silver_pipeline_logs` by aggregating
`rows_processed`. Execution duration statistics allow identification of heavier tenants or more expensive transformations.
Since execution status is stored, failed runs and constraint violations are also visible.

![Screenshot 2026-03-10 at 13.51.29.png](Screenshot%202026-03-10%20at%2013.51.29.png)

### 2. Supporting multiple data sinks in streaming ingestion
The simplest approach would be to extend the existing streamingestworker so that, after validating and mapping the
message, it writes the same data to both sinks sequentially. In this design, the worker becomes responsible for dual
writes. However, this tightly couples both sinks together. If one sink becomes slow or unavailable, it may block the
other one and negatively affect ingestion performance.

A more robust solution would be to decouple the sinks using Kafka. After consuming the original tenant-bronze topic,
the streamingestworker could publish the validated message to an additional Kafka topic (for example, tenant-<index>-validated).
Separate dedicated consumers would then write to mysimbdp-coredms and mybdp-extradatasink independently. This ensures fault
isolation — if one sink fails, the other continues processing without impact.

Since in my implementation Kafka is already heavily used, the decoupled approach is natural and appropriate. This design
also allows more flexible scaling, as each sink can be scaled independently based on its workload and performance
requirements. Additionally, retry policies and idempotent writes can be implemented separately for each sink.

So, I would choose the Kafka-based decoupled solution.

### 3. Data quality detection and management in near real-time ingestion
In this case, before the data reaches the tenant-specific streamingestworker, I would introduce an additional
preprocessing layer that acts as a data quality validator. This component would consume messages from the producer-facing
Kafka topic and evaluate them according to predefined quality rules.

The validation rules could include schema correctness, required field presence, value ranges, timestamp consistency,
and other business-specific constraints. Based on these checks, each message would be assigned a quality status 
(for example: VALID, WARNING, INVALID) or for instancem, a quality score.

Only messages that satisfy the predefined quality threshold would be forwarded to the tenant worker for storage in
bronze tables. Invalid or low-quality messages could either be discarded or redirected to a separate Kafka topic
(for example, tenant-<index>-rejected) for further inspection.

I would propose the detected quality information to be stored in the platform-level database (`mysimbdp_platform`) 
as it is metrics data basically.
This could be implemented through a dedicated `data_quality_logs` table containing tenant id, message id, timestamp,
quality score, validation status, and error description if applicable.

### 4. Supporting multiple silver pipelines per tenant
I already have a design that supports scaling of different pipeline executions and includes basic monitoring mechanisms
(for example CPU load checks). The batchmanager, which is responsible for launching pipelines, currently has a hardcoded
configuration defining which pipelines can be executed and how many parallel runs are allowed. The manager executes
Docker Compose commands to run the pipelines as separate processes.

To support multiple silver pipelines per tenant, each with different workloads and service agreements, I would extend
this design by introducing a configuration layer stored in the platform database instead of using a hardcoded
configuration. This configuration would define, per tenant and per pipeline, parameters such as maximum parallel
executions, execution time limits, batch size limits, and possibly resource requirements (CPU, memory).

The batchmanager would then dynamically read this configuration and schedule pipelines accordingly. For example,
a lightweight transformation pipeline could be allowed to run multiple times in parallel, while a complex feature
engineering pipeline could be restricted to a single execution due to higher CPU and memory usage.

In the future, instead of using a custom Docker-based manager, a more advanced orchestration mechanism
(such as Kubernetes jobs or a task queue with priority support) could be introduced. This would allow more precise
control over resource allocation and automatic scaling based on workload characteristics.

### 5. Redesigning complex silver pipelines for performance and fault tolerance
I would recommend splitting the pipeline into two separate components.

The first component would be responsible only for extraction and preparation. Its task would be to read bronze data,
create properly structured batch files in `tenant-caching-dir`, and update the checkpoint. It would not perform any heavy
transformation logic. This stage could focus on efficient data access and batch creation.

The second component would be responsible only for transformation. It would read prepared batch files from the caching
directory and perform the analytics logic, writing results into silver tables. Since this stage
operates only on files, it becomes fully decoupled from the database read layer.

This separation improves performance because both stages can be scaled independently. For example, extraction could run
less frequently but produce multiple batches, while transformation could run in parallel for different batch files. It
also improves fault management since - if transformation fails, the prepared batch file remains in the cache and can be retried
without re-reading bronze data. Similarly, extraction failures do not corrupt transformation logic.

From a maintenance perspective, splitting the pipeline makes the codebase cleaner. Each component has a single
responsibility and can evolve independently.

Also, this design allows future improvements such as distributed batch processing, prioritization of certain batches,
or even offloading transformation to another compute environment.
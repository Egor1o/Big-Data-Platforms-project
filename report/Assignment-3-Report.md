# Assignment 3 – Stream Analytics

## Part 1 – Design for Streaming Analytics

### 1. Dataset selection, scenario, and streaming analytics application (streamanalyticsapp)
For this assignment, as in the previous two assignments, I use the Reddit comments dataset. This dataset is perfectly
suitable because it naturally represents a stream of events, where each comment can be treated as an individual
event in a real-time system.

To emulate streaming behavior, I sort the dataset by the `created_utc` timestamp before the producer starts sending messages
to Kafka. This allows us to simulate near real-time ingestion in a realistic way. While this approach is not perfectly
identical to real-world streaming (since the data is pre-existing and read from a database), it still provides an 
accurate enough approximation of real-time event generation.

From an analytics perspective, the dataset is also very suitable. As described in Assignment 2, each comment contains
information about the subreddit, which enables grouping and aggregation. This allows performing streaming analytics such
as detecting spikes in subreddit activity, identifying trending topics, supporting marketing insights, or even acting as
an early signal for emerging news. These capabilities are particularly valuable in real-time scenarios where
immediate insights are required.

The scenario is designed as follows. A producer reads the dataset and sends each record as a message (event) to a
dedicated Kafka topic (stream-tenant-a). The streamanalyticsapp consumes these messages and processes them using a
tumbling window of 60 seconds based on event time (created_utc). To handle possible delays in processing or message
delivery, I introduce a watermark of 10 seconds, allowing late-arriving events to still be included in the correct
window. Events that arrive after this allowed delay are discarded.

When a window is closed, the application groups and aggregates the events within that window, for example by counting
the number of comments per subreddit to identify the most active subreddits during that time interval. The aggregated
results represent a summarized view of the streaming data.

After the window is finalized, the results are sent via a REST API to an analytics endpoint. The message includes the
window time range, tenant identifier, and aggregated metrics. The API layer validates the data and inserts it into
mysimbdp-coredms (CockroachDB), which acts as the data sink for storing streaming analytics results. This enables
further analysis, monitoring, and visualization of the processed data.


### 2. Messaging system design, data streams, and delivery guarantees

### 3. Time semantics, windowing, and out-of-order handling

### 4. Performance metrics for streamanalyticsapp

### 5. Architecture design for streaming analytics

## Part 2 – Implementation of Streaming Analytics

### 1. Implementation of streamanalyticsapp (schemas, serialization, processing logic, real-time output)

### 2. Test environment and setup

### 3. Execution results and performance evaluation

### 4. Handling erroneous data records

### 5. Parallelism, scalability, and performance analysis

## Part 3 – Extension

### 1. Integration of external ML inference service

### 2. Handling and storing erroneous records for further inspection

### 3. Workflow orchestration for triggering batch analytics and notifications

### 4. Schema evolution handling and detection

### 5. End-to-end exactly-once delivery
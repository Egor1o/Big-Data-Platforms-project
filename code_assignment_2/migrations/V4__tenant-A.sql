CREATE DATABASE IF NOT EXISTS tenantA;
USE tenantA;

CREATE TABLE IF NOT EXISTS comments_likes (
   id STRING PRIMARY KEY,
   subreddit STRING,
   score INT,
   ups INT,
   downs INT,
   created_utc INT
);

CREATE TABLE IF NOT EXISTS silver_subreddit_engagement_stats (
  subreddit STRING PRIMARY KEY,
  total_comments INT,
  total_ups INT,
  total_downs INT,
  avg_score FLOAT,
  avg_engagement_ratio FLOAT
);

CREATE TABLE IF NOT EXISTS silver_pipeline_state (
  pipeline_name STRING PRIMARY KEY,
  last_processed_id STRING
);

CREATE TABLE IF NOT EXISTS silver_pipeline_logs (
   tenant_id STRING,
   pipeline_name STRING,
   started_at TIMESTAMPTZ,
   finished_at TIMESTAMPTZ,
   duration_ms INT,
   rows_processed INT,
   status STRING,
   error STRING
);



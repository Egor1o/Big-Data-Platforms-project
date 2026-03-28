CREATE DATABASE IF NOT EXISTS tenantb;
USE tenantb;

CREATE TABLE IF NOT EXISTS comments_controversy (
  id STRING PRIMARY KEY,
  subreddit STRING,
  controversiality INT,
  removal_reason STRING,
  body STRING,
  created_utc INT
);

CREATE TABLE IF NOT EXISTS silver_subreddit_controversy_stats (
  subreddit STRING PRIMARY KEY,
  total_comments INT,
  controversial_comments INT,
  avg_controversiality FLOAT
);

CREATE TABLE IF NOT EXISTS silver_pipeline_state (
  pipeline_name STRING PRIMARY KEY,
  last_processed_id STRING
);
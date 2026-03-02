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
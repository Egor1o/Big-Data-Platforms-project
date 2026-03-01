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



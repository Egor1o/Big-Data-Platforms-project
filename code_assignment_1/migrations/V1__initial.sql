CREATE DATABASE IF NOT EXISTS reddit;
USE reddit;

CREATE TABLE IF NOT EXISTS comments (
    id STRING PRIMARY KEY,

    name STRING,
    link_id STRING,
    parent_id STRING,
    subreddit_id STRING,
    subreddit STRING,

    author STRING,
    author_flair_text STRING,
    author_flair_css_class STRING,

    body STRING,

    created_utc INT,
    retrieved_on INT,

    ups INT,
    downs INT,
    score INT,
    score_hidden BOOL,

    gilded INT,
    archived BOOL,
    edited BOOL,
    controversiality INT,

    distinguished STRING,
    removal_reason STRING
);

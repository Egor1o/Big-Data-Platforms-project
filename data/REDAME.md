## Instructions

This directory should contain the tenant’s database file. By default, there is a sample.sqlite, which is a copy of the
original dataset containing the newest records from the original table. Check the note below and change the SQLite file
name accordingly.

Please notice that both the consumer and the ingestor are using the same hardcoded path to locate the SQL database file.
The path is set by default to `/data/database.sqlite`, so please make sure to place the file there.

I used this set for the assignment: https://www.kaggle.com/datasets/kaggle/reddit-comments-may-2015
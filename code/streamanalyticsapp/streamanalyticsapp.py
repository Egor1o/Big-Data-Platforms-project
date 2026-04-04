from quixstreams import Application
from datetime import timedelta, datetime
import psycopg2
import json

# ---------------- CONFIG ----------------
KAFKA_BROKER = "kafka:9092"
TOPIC = "stream-tenant-a"
TENANT_ID = "tenant-a"

# ---------------- APP ----------------
app = Application(
    broker_address=KAFKA_BROKER,
    consumer_group="analytics-group",
    auto_offset_reset="earliest"
)

topic = app.topic(TOPIC)
sdf = app.dataframe(topic)

# ---------------- DB CONNECTION ----------------
conn = psycopg2.connect(
    host="roach-1",
    port=26257,
    dbname="streamanalytics",
    user="root",
    sslmode="disable"
)
cur = conn.cursor()

# ---------------- HELPERS ----------------
def parse(value):
    try:
        if isinstance(value, str):
            data = json.loads(value)
        elif isinstance(value, dict):
            data = value
        else:
            return None

        return {
            "subreddit": data.get("subreddit"),
            "created_utc": data.get("created_utc"),
            "count": 1
        }

    except Exception as e:
        print("Parse error:", e)
        return None


def set_ts(value, key, timestamp, headers):
    if value and value.get("created_utc"):
        return int(value["created_utc"]) * 1000
    return timestamp


# ---------------- WINDOW HANDLER ----------------
def handle_window(row):
    try:
        # ✅ FIX: correct structure
        value = row["value"]

        subreddit = value["subreddit"]
        count = value["count"]

        window_start = datetime.fromtimestamp(row["start"] / 1000)
        window_end = datetime.fromtimestamp(row["end"] / 1000)

        print(f"📊 {subreddit} | {count} | {window_start} - {window_end}")

        cur.execute("""
                    INSERT INTO subreddit_window_stats (
                        tenant_id,
                        subreddit,
                        window_start,
                        window_end,
                        comment_count
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    """, (
                        TENANT_ID,
                        subreddit,
                        window_start,
                        window_end,
                        count
                    ))

        conn.commit()

    except Exception as e:
        print("❌ DB error:", e)
        print("ROW DEBUG:", row)


# ---------------- PIPELINE ----------------
(
    sdf
    .apply(parse)
    .filter(lambda x: x is not None and x["subreddit"] is not None)
    .set_timestamp(set_ts)

    .group_by(lambda x: x["subreddit"], name="subreddit")

    .tumbling_window(timedelta(seconds=5))

    .reduce(
        lambda acc, x: {
            "subreddit": x.get("subreddit", acc.get("subreddit")),
            "count": acc.get("count", 0) + x.get("count", 1)
        },
        lambda x: {
            "subreddit": x.get("subreddit"),
            "count": x.get("count", 1)
        }
    )

    .final()

    .update(handle_window)
)

# ---------------- RUN ----------------
app.clear_state()
app.run()
import Database from "better-sqlite3";
import { Kafka } from "kafkajs";
import { mapRowToComment } from "./utils.js";

const KAFKA_BROKER = process.env.KAFKA_BROKER ?? "kafka:9092";
const TENANT_TOPIC = process.env.TENANT_TOPIC ?? "stream-tenant-a";
const BATCH_SIZE = 500;

const db = new Database("../../data/database.sqlite", { readonly: true });

const stmt = db.prepare(`
    SELECT *
    FROM May2015
    WHERE created_utc BETWEEN ? AND ?
    ORDER BY created_utc
`);

const kafka = new Kafka({
    brokers: [KAFKA_BROKER],
});

const producer = kafka.producer();

const MAY_START = 1430438400;
const MAY_END = 1433116799;
const MAY_HALF = (MAY_END - MAY_START) / 2 + MAY_START;

export const produceMessagesToKafka = async (
    topic: string,
    rangeStart: number,
    rangeEnd: number
) => {
    await producer.connect();

    let batch: any[] = [];
    let total = 0;

    console.log(`🚀 Producing to topic ${topic}`);

    for (const row of stmt.iterate(rangeStart, rangeEnd)) {
        const mapped = mapRowToComment(row);

        batch.push({
            // IMPORTANT: key = subreddit (for correct partitioning)
            key: mapped.subreddit ?? "unknown",
            value: JSON.stringify(mapped),
        });

        if (batch.length >= BATCH_SIZE) {
            await producer.send({
                topic,
                messages: batch,
            });

            total += batch.length;
            console.log(`📦 Sent batch (${batch.length}) | Total: ${total}`);

            batch = [];
        }
    }

    // send remaining messages
    if (batch.length > 0) {
        await producer.send({
            topic,
            messages: batch,
        });

        total += batch.length;
        console.log(`📦 Sent final batch (${batch.length}) | Total: ${total}`);
    }

    await producer.disconnect();
    db.close();

    console.log(`✅ Finished producing ${total} messages`);
};

// ---- RUN ----
const isTenantA = TENANT_TOPIC === "stream-tenant-a";

produceMessagesToKafka(
    TENANT_TOPIC,
    isTenantA ? MAY_START : MAY_HALF,
    isTenantA ? MAY_HALF : MAY_END
);
import { Kafka } from "kafkajs";
import { connectDb, insertBatch } from "./database.js";
import { mapControversyMessage } from "./message-mapper.js";
import type { Client } from "pg";

const TENANT_ID = process.env.TENANT_ID;
if (!TENANT_ID) throw new Error("TENANT_ID missing");

const WORKER_ID = process.env.HOSTNAME ?? "unknown";

const TOPIC = `${TENANT_ID}-bronze`;
const METRICS_TOPIC = "metrics";

const kafka = new Kafka({
    brokers: ["kafka:9092"],
});

const consumer = kafka.consumer({
    groupId: `${TENANT_ID}-group`,
});

const producer = kafka.producer();

const RETRYABLE_ERRORS = new Set([
    '57P01',
    '40001',
    '08006',
    '08003',
]);

const MAX_RETRIES = 10;
const BATCH_SIZE = 500;
const REPORT_INTERVAL_MS = 10000;

let batch: any[] = [];
let client: Client | null = null;

let intervalRows = 0;
let intervalBytes = 0;
let intervalLatencySum = 0;
let intervalBatchCount = 0;

const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
    client = await connectDb();

    await consumer.connect();
    await producer.connect();

    await consumer.subscribe({
        topic: TOPIC,
        fromBeginning: true,
    });

    console.log(
        `Controversiality worker started for ${TENANT_ID} (worker=${WORKER_ID})`
    );

    setInterval(reportMetrics, REPORT_INTERVAL_MS);

    await consumer.run({
        eachMessage: async ({ message }) => {
            try {
                const rawBuffer = message.value!;
                const messageBytes = rawBuffer.length;

                intervalBytes += messageBytes;

                const parsed = JSON.parse(rawBuffer.toString());
                const mapped = mapControversyMessage(parsed);

                batch.push(mapped);

                if (batch.length >= BATCH_SIZE) {
                    await insertWithRetry(batch);
                    batch = [];
                }
            } catch (err) {
                console.error("Message processing failed:", err);
            }
        },
    });
}

async function insertWithRetry(batch: any[]) {
    let attempt = 0;

    while (true) {
        try {
            const start = Date.now();

            await insertBatch(batch);

            const latency = Date.now() - start;

            intervalRows += batch.length;
            intervalLatencySum += latency;
            intervalBatchCount++;

            console.log(
                `Inserted ${batch.length} rows in ${latency} ms`
            );

            return;
        } catch (err: any) {
            attempt++;
            const code = err?.code;

            if (RETRYABLE_ERRORS.has(code) && attempt < MAX_RETRIES) {
                await sleep(200 * Math.pow(2, attempt));
            } else {
                throw err;
            }
        }
    }
}

async function reportMetrics() {
    const avgLatency =
        intervalBatchCount === 0
            ? 0
            : Math.round(intervalLatencySum / intervalBatchCount);

    const metricsPayload = {
        tenant_id: TENANT_ID,
        worker_id: WORKER_ID,
        timestamp: new Date().toISOString(),
        rows_inserted: intervalRows,
        ingestion_bytes: intervalBytes,
        avg_batch_latency_ms: avgLatency,
    };

    try {
        await producer.send({
            topic: METRICS_TOPIC,
            messages: [
                {
                    key: TENANT_ID!,
                    value: JSON.stringify(metricsPayload),
                },
            ],
        });

        console.log(
            `Metrics sent → rows=${intervalRows}, bytes=${intervalBytes}, avgLatency=${avgLatency}ms`
        );

        intervalRows = 0;
        intervalBytes = 0;
        intervalLatencySum = 0;
        intervalBatchCount = 0;

    } catch (err) {
        console.error("Failed to send metrics:", err);
    }
}

process.on("SIGTERM", async () => {
    console.log("Graceful shutdown...");

    if (batch.length > 0) {
        await insertWithRetry(batch);
    }

    await reportMetrics();

    await consumer.disconnect();
    await producer.disconnect();

    if (client) {
        await client.end();
    }

    process.exit(0);
});

run();
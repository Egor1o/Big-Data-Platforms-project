import { Kafka } from "kafkajs";
import { Client } from "pg";

const kafka = new Kafka({
    brokers: ["kafka:9092"],
});

const consumer = kafka.consumer({
    groupId: "monitor-group",
});

const producer = kafka.producer();

const db = new Client({
    host: "cockroach-1",
    port: 26257,
    user: "root",
    database: "mysimbdp_platform",
    ssl: false,
});

const SCALE_UP_LATENCY = 30;
const SCALE_DOWN_LATENCY = 5;

async function notifyManager(action: string, tenantId: string) {
    const payload = {
        tenant_id: tenantId,
        action,
        timestamp: new Date().toISOString(),
    };

    await producer.send({
        topic: "manager-control",
        messages: [
            {
                key: tenantId,
                value: JSON.stringify(payload),
            },
        ],
    });

    console.log(`Manager notified: ${tenantId} → ${action}`);
}

async function checkThresholdAndNotify(
    tenantId: string,
    avgLatency: number
) {
    if (avgLatency > SCALE_UP_LATENCY) {
        await notifyManager("scale_up", tenantId);
    }
    else if (avgLatency < SCALE_DOWN_LATENCY) {
        await notifyManager("scale_down", tenantId);
    }
}

async function run() {
    await db.connect();
    await consumer.connect();
    await producer.connect();

    await consumer.subscribe({
        topic: "metrics",
        fromBeginning: false,
    });

    console.log("StreamingIngestMonitor started");

    await consumer.run({
        eachMessage: async ({ message }) => {
            try {
                const payload = JSON.parse(
                    message.value!.toString()
                );

                const {
                    tenant_id,
                    worker_id,
                    rows_inserted,
                    ingestion_bytes,
                    avg_batch_latency_ms,
                    timestamp,
                } = payload;

                await db.query(
                    `
                    INSERT INTO ingest_metrics
                    (tenant_id, worker_id, ts, rows_inserted, ingestion_bytes, avg_batch_latency_ms)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    `,
                    [
                        tenant_id,
                        worker_id,
                        timestamp,
                        rows_inserted,
                        ingestion_bytes,
                        avg_batch_latency_ms,
                    ]
                );

                console.log(
                    `Metrics stored for ${tenant_id} (${worker_id})`
                );

                await checkThresholdAndNotify(
                    tenant_id,
                    avg_batch_latency_ms
                );

            } catch (err) {
                console.error("Failed to process metrics:", err);
            }
        },
    });
}

run().catch((err) => {
    console.error("Monitor failed:", err);
    process.exit(1);
});
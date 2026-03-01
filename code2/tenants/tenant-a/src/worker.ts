import { Kafka } from "kafkajs";
import { connectDb, insertBatch } from "./database.js";
import { mapLikesMessage } from "./message-mapper.js";
import type {Client} from "pg";

const TENANT_ID = process.env.TENANT_ID;
if (!TENANT_ID) throw new Error("TENANT_ID missing");

const TOPIC = `${TENANT_ID}-bronze`;

const kafka = new Kafka({
    brokers: ["kafka:9092"],
});

const consumer = kafka.consumer({
    groupId: `${TENANT_ID}-group`,
});

const RETRYABLE_ERRORS = new Set([
    '57P01',
    '40001',
    '08006',
    '08003',
]);

const MAX_RETRIES = 10;
const BATCH_SIZE = 500;
let batch: any[] = [];
let client: Client | null = null;

const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));


async function run() {
    client = await connectDb();
    await consumer.connect();
    await consumer.subscribe({
        topic: TOPIC,
        fromBeginning: true
    });

    console.log(`Likes worker started for ${TENANT_ID}`);

    await consumer.run({
        eachMessage: async ({ message }) => {
            try {
                const parsed = JSON.parse(message.value!.toString());
                const mapped = mapLikesMessage(parsed);

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
            await insertBatch(batch);
            console.log(`Inserted ${batch.length} comments`);
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

process.on("SIGTERM", async () => {
    console.log("Graceful shutdown...");

    if (batch.length > 0) {
        await insertWithRetry(batch);
    }

    await consumer.disconnect();

    if (client) {
        await client.end();
    }

    process.exit(0);
});

run();
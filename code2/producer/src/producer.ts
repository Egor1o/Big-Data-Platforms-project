import Database from "better-sqlite3";
import {mapRowToComment} from './utils.js';
const db = new Database("../../data/database.sqlite", { readonly: true });
import { Kafka } from "kafkajs";

const kafka = new Kafka({
    brokers: ["kafka:9092"],
});

const producer = kafka.producer();

const TENANT_TOPIC = process.env.TENANT_TOPIC ?? 'tenant-a-bronze'

const stmt = db.prepare(`
    SELECT *
    FROM May2015
    WHERE created_utc BETWEEN ? AND ?
    ORDER BY created_utc
`);

const BATCH_SIZE = 500;
let batch: any[] = [];


const MAY_START = 1430438400; // May 1, 2015 00:00:00 UTC
const MAY_END = 1433116799;   // May 31, 2015 23:59:59 UTC
const MAY_HALF = (MAY_END - MAY_START) / 2 + MAY_START;


export const produceMessagesToKafka = async (
    topic: string,
    rangeStart: number,
    rangeEnd: number
) => {
    await producer.connect();

    let batch: any[] = [];

    for (const row of stmt.iterate(rangeStart, rangeEnd)) {
        const mapped = mapRowToComment(row);

        batch.push({
            key: mapped.id?.toString(),
            value: JSON.stringify(mapped),
        });

        if (batch.length >= BATCH_SIZE) {
            await producer.send({
                topic,
                messages: batch,
            });

            batch = [];
        }
    }

    if (batch.length > 0) {
        await producer.send({
            topic,
            messages: batch,
        });
    }

    await producer.disconnect();
    db.close();

    console.log(`Finished producing to topic ${topic}`);
};


produceMessagesToKafka(TENANT_TOPIC, TENANT_TOPIC === 'tenant-a-bronze' ? MAY_START : MAY_HALF, TENANT_TOPIC === 'tenant-a-bronze' ? MAY_HALF : MAY_END)
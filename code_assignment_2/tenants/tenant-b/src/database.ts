import { Client } from "pg";
import { type ControversyMessage } from "./message-mapper.js";

const HOSTS = ["cockroach-1", "cockroach-2", "cockroach-3"];

let client: Client | null = null;

export async function connectDb() {
    if (client) return client;

    for (const host of HOSTS) {
        const testClient = new Client({
            host,
            port: 26257,
            user: "root",
            database: "tenantb",
            ssl: false,
        });

        try {
            await testClient.connect();
            client = testClient;
            console.log(`Connected to ${host}`);
            return client;
        } catch {
            await testClient.end().catch(() => {});
        }
    }

    throw new Error("All Cockroach nodes unavailable");
}

export async function insertBatch(batch: ControversyMessage[]) {
    if (!client) throw new Error("DB not connected");

    const valuesPlaceholders = batch
        .map((_, index) => {
            const offset = index * 6;
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
        })
        .join(",");

    const values = batch.flatMap(row => [
        row.id,
        row.subreddit,
        row.controversiality,
        row.removal_reason,
        row.body,
        row.created_utc,
    ]);

    await client.query(
        `
    INSERT INTO comments_controversy
    (id, subreddit, controversiality, removal_reason, body, created_utc)
    VALUES ${valuesPlaceholders}
    ON CONFLICT (id) DO NOTHING
    `,
        values
    );
}
import type {Client} from "pg";
import {getClient} from "./database.js";



const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

const RETRYABLE_ERRORS = new Set([
    '57P01',
    '40001',
    '08006',
    '08003',
]);

const MAX_RETRIES = 10;

export const readData = async (batch: any[], workerId: number) => {
    if (batch.length === 0) return;
    let attempt = 0;

    while (true) {
        let client: Client | null = null;

        try {
            client = await getClient();
            return;
        } catch (err: any) {
            attempt++;

            const code = err?.code;
            console.error(`R failed (attempt ${attempt}, code=${code})`);

            if (RETRYABLE_ERRORS.has(code) && attempt < MAX_RETRIES) {
                await sleep(200 * Math.pow(2, attempt));
                continue;
            }

            throw err;
        } finally {
            if (client) {
                try {
                    await client.end();
                } catch {
                }
            }
        }
    }
};

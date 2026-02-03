import type {Client} from "pg";
import {getClient, read500MostPopular, read500Newest} from "./database.js";

const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

const RETRYABLE_ERRORS = new Set([
    '57P01',
    '40001',
    '08006',
    '08003',
]);

const MAX_RETRIES = 10;

export const readData = async (workerId: number) => {
    let attempt = 0;

    while (true) {
        let client: Client | null = null;

        try {
            client = await getClient();
            await read500MostPopular(workerId, client)
            await read500Newest(workerId, client)
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


const workerIdEnv = process.env.WORKER_ID;
if(!workerIdEnv) throw new Error("WORKER_ID env var not set");
const workerId = parseInt(workerIdEnv);

await readData(workerId)
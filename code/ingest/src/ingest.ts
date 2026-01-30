import Database from 'better-sqlite3';
import {calculateRange, mapRowToComment} from "./utils.js";
import {Client} from "pg";
import {createSqlIngestQueryAndValues, getClient} from "./database.js";
const db = new Database("../../tenant/database.sqlite", { readonly: true });

const stmt = db.prepare(`
  SELECT *
  FROM May2015
  WHERE created_utc BETWEEN ? AND ?
  ORDER BY created_utc
`);

const BATCH_SIZE = 500;
let batch: any[] = [];


const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

const RETRYABLE_ERRORS = new Set([
    '57P01',
    '40001',
    '08006',
    '08003',
]);

const MAX_RETRIES = 10;

export const flushBatch = async (batch: any[]) => {
    if (batch.length === 0) return;

    const { query, values } = createSqlIngestQueryAndValues(batch);

    let attempt = 0;

    while (true) {
        let client: Client | null = null;

        try {
            client = await getClient();
            await client.query(query, values);
            console.log(`Inserted ${batch.length} comments`);
            return;
        } catch (err: any) {
            attempt++;

            const code = err?.code;
            console.error(`Insert failed (attempt ${attempt}, code=${code})`);

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


async function ingestData(rangeStart:number, rangeEnd:number) {
    for (const row of stmt.iterate(rangeStart, rangeEnd)) {

        batch.push(mapRowToComment(row));

        if (batch.length >= BATCH_SIZE) {
            await flushBatch(batch);
            batch.length = 0;
        }
    }

    if (batch.length > 0) {
        await flushBatch(batch);
    }

    db.close();
}

const workersTotal = process.env.WORKERS ? parseInt(process.env.WORKERS) : null;
if(workersTotal === null) throw new Error("WORKERS_TOTAL env var not set");

const workerIdEnv = process.env.WORKER_ID;
if(!workerIdEnv) throw new Error("WORKER_ID env var not set");

const workerId = parseInt(workerIdEnv)
const {rangeStart, rangeEnd} = calculateRange(workerId, workersTotal);

await ingestData(rangeStart, rangeEnd);





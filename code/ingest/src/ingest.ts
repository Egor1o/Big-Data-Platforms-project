import Database from 'better-sqlite3';
import {calculateRange} from "./utils.js";
import {Client} from "pg";
const db = new Database("../../tenant/database.sqlite", { readonly: true });

const stmt = db.prepare(`
  SELECT *
  FROM May2015
  WHERE created_utc BETWEEN ? AND ?
  ORDER BY created_utc
`);

const BATCH_SIZE = 500;
let batch: any[] = [];

const client = new Client({
    connectionString: process.env.DATABASE_URL
})

await client.connect()

const flushBatch = (batch: any[]) => {
    batch.splice(0,batch.length)
}

async function ingestData(rangeStart:number, rangeEnd:number) {
    for (const row of stmt.iterate(rangeStart, rangeEnd)) {

        //console.log(row);
        batch.push(row);

        if (batch.length >= BATCH_SIZE) {
            flushBatch(batch);
            const res = await client.query(`
              SELECT id, author, subreddit, created_utc
              FROM comments
              ORDER BY created_utc
              LIMIT 5
            `);
            console.log('the result', res.rows);
            batch.length = 0;
        }
    }

    if (batch.length > 0) {
        flushBatch(batch);
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





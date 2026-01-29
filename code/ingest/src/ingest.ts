import Database from 'better-sqlite3';
import {calculateRange} from "./utils.js";
const db = new Database("../../tenant/database.sqlite", { readonly: true });

const stmt = db.prepare(`
  SELECT *
  FROM May2015
  WHERE created_utc BETWEEN ? AND ?
  ORDER BY created_utc
`);

const BATCH_SIZE = 500;
let batch: any[] = [];

const flushBatch = (batch: any[]) => {
    batch.splice(0,batch.length)
}

function ingestData(rangeStart:number, rangeEnd:number) {
    for (const row of stmt.iterate(rangeStart, rangeEnd)) {

        console.log(row);
        batch.push(row);

        if (batch.length >= BATCH_SIZE) {
            flushBatch(batch);
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

ingestData(rangeStart, rangeEnd);





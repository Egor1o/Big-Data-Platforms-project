import Database from 'better-sqlite3';

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

const RANGE_START = 1430438400;
const RANGE_END = 1433020399;


ingestData(RANGE_START, RANGE_END);





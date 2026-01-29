import Database from 'better-sqlite3';
import {calculateRange, mapRowToComment} from "./utils.js";
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

const flushBatch = async (batch: any[]) => {
    if (batch.length === 0) return;

    const valuesPlaceholders = batch.map((_, index) => {
        const offset = index * 22;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20}, $${offset + 21}, $${offset + 22})`;
    }).join(', ');

    const values = batch.flatMap(row => [
        row.id,
        row.name,
        row.link_id,
        row.parent_id,
        row.subreddit_id,
        row.subreddit,
        row.author,
        row.author_flair_text,
        row.author_flair_css_class,
        row.body,
        row.created_utc,
        row.retrieved_on,
        row.ups,
        row.downs,
        row.score,
        row.score_hidden,
        row.gilded,
        row.archived,
        row.edited,
        row.controversiality,
        row.distinguished,
        row.removal_reason
    ]);

    const insertQuery = `
        INSERT INTO comments (
            id, name, link_id, parent_id, subreddit_id, subreddit,
            author, author_flair_text, author_flair_css_class,
            body, created_utc, retrieved_on,
            ups, downs, score, score_hidden,
            gilded, archived, edited, controversiality,
            distinguished, removal_reason
        ) VALUES ${valuesPlaceholders}
        ON CONFLICT (id) DO NOTHING
    `;

    try {
        await client.query(insertQuery, values);
        console.log(`Inserted ${batch.length} comments`);
    } catch (error) {
        console.error('Error inserting batch:', error);
        throw error;
    }
}

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





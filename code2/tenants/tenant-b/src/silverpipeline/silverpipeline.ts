import { Client } from "pg";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const DATABASE_URL =
    process.env.DATABASE_URL ||
    "postgresql://root@cockroach-1:26257/tenantb?sslmode=disable";

const TENANT_ID = "tenant-b";
const PIPELINE_NAME = "tenant-b-controversy";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const constraintsPath = path.join(
    __dirname,
    "constraints.json"
);

const constraints = JSON.parse(
    fs.readFileSync(constraintsPath, "utf-8")
);

const MAX_INPUT_ROWS = constraints.max_input_rows;
const MAX_EXECUTION_TIME_MS =
    constraints.max_execution_time_seconds * 1000;
const MAX_RETRIES = constraints.max_retries;
const BACKOFF_MS = constraints.backoff_seconds * 1000;

const CACHE_DIR =
    process.env.TENANT_CACHE_DIR ||
    `/tenant-cache/${TENANT_ID}`;

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function executePipeline() {
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: false,
    });

    await client.connect();
    await fsp.mkdir(CACHE_DIR, { recursive: true });

    let cacheFilePath: string | null = null;

    await client.query("BEGIN");

    const stateResult = await client.query(
        `SELECT last_processed_id
     FROM silver_pipeline_state
     WHERE pipeline_name = $1`,
        [PIPELINE_NAME]
    );

    const lastProcessedId =
        stateResult.rows.length > 0
            ? stateResult.rows[0].last_processed_id
            : null;

    const bronzeResult = await client.query(
        `
    SELECT id, subreddit, controversiality
    FROM comments_controversy
    WHERE ($1::STRING IS NULL OR id > $1)
    ORDER BY id
    LIMIT $2
    `,
        [lastProcessedId, MAX_INPUT_ROWS]
    );

    if (!bronzeResult.rowCount) {
        await client.query("COMMIT");
        await client.end();
        return;
    }

    const bronzeRows = bronzeResult.rows;

    cacheFilePath = path.join(
        CACHE_DIR,
        `batch-${Date.now()}.json`
    );

    await fsp.writeFile(
        cacheFilePath,
        JSON.stringify(bronzeRows),
        "utf-8"
    );

    const fileContent = await fsp.readFile(
        cacheFilePath,
        "utf-8"
    );

    const cachedRows = JSON.parse(fileContent);

    const stats: Record<
        string,
        {
            total_comments: number;
            controversial_comments: number;
            total_controversiality: number;
        }
    > = {};

    for (const row of cachedRows) {
        if (!stats[row.subreddit]) {
            stats[row.subreddit] = {
                total_comments: 0,
                controversial_comments: 0,
                total_controversiality: 0,
            };
        }

        stats[row.subreddit]!.total_comments += 1;
        stats[row.subreddit]!.total_controversiality += Number(
            row.controversiality ?? 0
        );

        if (row.controversiality > 0) {
            stats[row.subreddit]!.controversial_comments += 1;
        }
    }

    for (const subreddit of Object.keys(stats)) {
        const s = stats[subreddit]!;

        const avgControversiality =
            s.total_comments > 0
                ? s.total_controversiality / s.total_comments
                : 0;

        await client.query(
            `
      INSERT INTO silver_subreddit_controversy_stats
      (subreddit, total_comments, controversial_comments, avg_controversiality)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (subreddit)
      DO UPDATE SET
        total_comments = silver_subreddit_controversy_stats.total_comments + EXCLUDED.total_comments,
        controversial_comments = silver_subreddit_controversy_stats.controversial_comments + EXCLUDED.controversial_comments,
        avg_controversiality = EXCLUDED.avg_controversiality
      `,
            [
                subreddit,
                s.total_comments,
                s.controversial_comments,
                avgControversiality,
            ]
        );
    }

    const lastIdProcessed =
        cachedRows[cachedRows.length - 1].id;

    await client.query(
        `
    INSERT INTO silver_pipeline_state
    (pipeline_name, last_processed_id)
    VALUES ($1, $2)
    ON CONFLICT (pipeline_name)
    DO UPDATE SET last_processed_id = $2
    `,
        [PIPELINE_NAME, lastIdProcessed]
    );

    console.log("Inserted batch up to ID:", lastIdProcessed, "with", bronzeResult.rowCount, "rows");
    await client.query("COMMIT");

    if (cacheFilePath) {
        await fsp.unlink(cacheFilePath);
    }

    await client.end();
}

async function runWithConstraints() {
    const timeout = setTimeout(() => {
        console.error("Execution time exceeded");
        process.exit(1);
    }, MAX_EXECUTION_TIME_MS);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            await executePipeline();
            clearTimeout(timeout);
            process.exit(0);
        } catch (err) {
            if (attempt === MAX_RETRIES) {
                clearTimeout(timeout);
                process.exit(1);
            }
            await sleep(BACKOFF_MS);
        }
    }
}

runWithConstraints();
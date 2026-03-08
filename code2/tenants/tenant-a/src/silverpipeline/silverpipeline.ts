import { Client } from "pg";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import {fileURLToPath} from "url";

const DATABASE_URL =
    process.env.DATABASE_URL ||
    "postgresql://root@cockroach-1:26257/tenanta?sslmode=disable";

const TENANT_ID = "tenant-a";
const PIPELINE_NAME = "tenant-a-engagement";

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
    SELECT id, subreddit, score, ups, downs
    FROM comments_likes
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
            total_ups: number;
            total_downs: number;
            total_score: number;
        }
    > = {};

    for (const row of cachedRows) {
        if (!stats[row.subreddit]) {
            stats[row.subreddit] = {
                total_comments: 0,
                total_ups: 0,
                total_downs: 0,
                total_score: 0,
            };
        }

        stats[row.subreddit]!.total_comments += 1;
        stats[row.subreddit]!.total_ups += Number(row.ups ?? 0);
        stats[row.subreddit]!.total_downs += Number(row.downs ?? 0);
        stats[row.subreddit]!.total_score += Number(row.score ?? 0);
    }

    for (const subreddit of Object.keys(stats)) {
        const s = stats[subreddit]!;

        const avgScore =
            s.total_comments > 0
                ? s.total_score / s.total_comments
                : 0;

        const engagementRatio =
            s.total_ups + s.total_downs > 0
                ? s.total_ups /
                (s.total_ups + s.total_downs)
                : 0;

        await client.query(
            `
      INSERT INTO silver_subreddit_engagement_stats
      (subreddit, total_comments, total_ups, total_downs, avg_score, avg_engagement_ratio)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (subreddit)
      DO UPDATE SET
        total_comments = silver_subreddit_engagement_stats.total_comments + EXCLUDED.total_comments,
        total_ups = silver_subreddit_engagement_stats.total_ups + EXCLUDED.total_ups,
        total_downs = silver_subreddit_engagement_stats.total_downs + EXCLUDED.total_downs,
        avg_score = EXCLUDED.avg_score,
        avg_engagement_ratio = EXCLUDED.avg_engagement_ratio
      `,
            [
                subreddit,
                s.total_comments,
                s.total_ups,
                s.total_downs,
                avgScore,
                engagementRatio,
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

    console.log(`Processed batch up to ID ${lastIdProcessed}`, `with ${bronzeResult.rowCount} rows`);

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
        } catch {
            if (attempt === MAX_RETRIES) {
                clearTimeout(timeout);
                process.exit(1);
            }
            await sleep(BACKOFF_MS);
        }
    }
}

runWithConstraints();
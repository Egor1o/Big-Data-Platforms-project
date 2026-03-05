import { Client } from "pg";

const DATABASE_URL =
    process.env.DATABASE_URL ||
    "postgresql://root@cockroach-1:26257/tenantA?sslmode=disable";

const MAX_INPUT_ROWS = 100000;
const PIPELINE_NAME = "tenant-a-engagement";

async function run() {
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: false,
    });

    await client.connect();

    console.log("Starting silver pipeline for tenant-a");

    try {
        await client.query("BEGIN");

        // get the head of offset if in db
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

        //offset here to start from where ended previously
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

        if (!bronzeResult.rowCount || bronzeResult.rowCount === 0) {
            console.log("No new bronze rows to process");
            await client.query("COMMIT");
            await client.end();
            return;
        }

        console.log(`Processing ${bronzeResult.rowCount} bronze rows`);

        const stats: Record<
            string,
            {
                total_comments: number;
                total_ups: number;
                total_downs: number;
                total_score: number;
            }
        > = {};

        for (const row of bronzeResult.rows) {
            const subreddit = row.subreddit;

            if (!stats[subreddit]) {
                stats[subreddit] = {
                    total_comments: 0,
                    total_ups: 0,
                    total_downs: 0,
                    total_score: 0,
                };
            }

            const ups = Number(row.ups ?? 0);
            const downs = Number(row.downs ?? 0);
            const score = Number(row.score ?? 0);

            stats[subreddit].total_comments += 1;
            stats[subreddit].total_ups += ups;
            stats[subreddit].total_downs += downs;
            stats[subreddit].total_score += score;
        }

        for (const subreddit of Object.keys(stats)) {
            const s = stats[subreddit]!;

            const avgScore =
                s.total_comments > 0
                    ? s.total_score / s.total_comments
                    : 0;

            const engagementRatio =
                s.total_ups + s.total_downs > 0
                    ? s.total_ups / (s.total_ups + s.total_downs)
                    : 0;

            await client.query(
                `
                    INSERT INTO silver_subreddit_engagement_stats
                    (subreddit, total_comments, total_ups, total_downs, avg_score, avg_engagement_ratio)
                    VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (subreddit)
                        DO UPDATE SETß
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
            bronzeResult.rows[bronzeResult.rowCount - 1].id;

        await client.query(
            `
                INSERT INTO silver_pipeline_state (pipeline_name, last_processed_id)
                VALUES ($1, $2)
                    ON CONFLICT (pipeline_name)
                DO UPDATE SET last_processed_id = $2
            `,
            [PIPELINE_NAME, lastIdProcessed]
        );

        await client.query("COMMIT");

        console.log("Silver pipeline completed successfully");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Silver pipeline failed:", err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
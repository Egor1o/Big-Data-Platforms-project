import { Client } from "pg";

const DATABASE_URL =
    process.env.DATABASE_URL ||
    "postgresql://root@cockroach-1:26257/tenantb?sslmode=disable";

const MAX_INPUT_ROWS = 100000;
const PIPELINE_NAME = "tenant-b-controversy";

async function run() {
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: false,
    });

    await client.connect();

    console.log("Starting silver pipeline for tenant-b");

    try {
        await client.query("BEGIN");

        const stateResult = await client.query(
            `SELECT last_processed_id FROM silver_pipeline_state WHERE pipeline_name = $1`,
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

        if (bronzeResult.rowCount === 0) {
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
                controversial_comments: number;
                total_controversiality: number;
            }
        > = {};

        for (const row of bronzeResult.rows) {
            if (!stats[row.subreddit]) {
                stats[row.subreddit] = {
                    total_comments: 0,
                    controversial_comments: 0,
                    total_controversiality: 0,
                };
            }

            stats[row.subreddit]!.total_comments++;
            stats[row.subreddit]!.total_controversiality += row.controversiality;

            if (row.controversiality > 0) {
                stats[row.subreddit]!.controversial_comments++;
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
            bronzeResult.rows[bronzeResult.rowCount! - 1].id;

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
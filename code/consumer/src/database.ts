import { Client } from "pg";

const HOSTS = [
    "cockroach-1",
    "cockroach-2",
    "cockroach-3",
];

export async function getClient() {
    let lastError: any;

    for (const host of HOSTS) {
        const client = new Client({
            host,
            port: 26257,
            user: "root",
            database: "reddit",
            ssl: false,
            keepAlive: true,
            connectionTimeoutMillis: 2000,
        });

        try {
            await client.connect();
            return client;
        } catch (err) {
            lastError = err;
            await client.end().catch(() => {});
        }
    }

    throw lastError ?? new Error("All CockroachDB nodes are down");
}
export const writeMetrics = async (
    consumerId: number,
    queryType: string,
    rowsReturned: number,
    queryLatencyMs: number,
    client: Client
) => {
    try {
        await client.query(
            `
             INSERT INTO consume_metrics 
                 (ts, consumer_id, query_type, rows_returned, query_latency_ms)
             VALUES (NOW(), $1, $2, $3, $4)`,
            [consumerId, queryType, rowsReturned, queryLatencyMs]
        );
    } catch (err) {
        console.error(`Failed to write metrics for consumer ${consumerId}:`, err);
    }
};

const read500MostPopular = async (workerId: number, client: Client) => {
    const startTime = Date.now();

    const result = await client.query(
        `SELECT
              subreddit,
              COUNT(*) AS comment_count
            FROM comments
            GROUP BY subreddit
            ORDER BY comment_count DESC
            LIMIT 500;
    `);
    const readDuration = Date.now() - startTime;

    console.log(`Worker ${workerId} read 500 most popular subreddits`);

    await writeMetrics(workerId, 'most_popular', result.rowCount || 0, readDuration, client);

    return result.rows;
};

const read500Newest = async (workerId: number, client: Client) => {
    const startTime = Date.now();

    const result = await client.query(
        `SELECT
              id,
              created_utc
            FROM comments
            ORDER BY created_utc DESC
            LIMIT 500;
    `);
    const readDuration = Date.now() - startTime;

    console.log(`Worker ${workerId} read 500 newest comments`);

    await writeMetrics(workerId, 'newest_comments', result.rowCount || 0, readDuration, client);

    return result.rows;
}
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

        client.on('error', (err) => {
            console.error('[PG CLIENT ERROR]', err.message);
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

export const createSqlIngestQueryAndValues = (batch: any[]) => {
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

    return {query: `
        INSERT INTO comments (
            id, name, link_id, parent_id, subreddit_id, subreddit,
            author, author_flair_text, author_flair_css_class,
            body, created_utc, retrieved_on,
            ups, downs, score, score_hidden,
            gilded, archived, edited, controversiality,
            distinguished, removal_reason
        ) VALUES ${valuesPlaceholders}
        ON CONFLICT (id) DO NOTHING
    `, values}
}
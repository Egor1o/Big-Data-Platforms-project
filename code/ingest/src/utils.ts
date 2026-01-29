const MAY_START = 1430438400; // May 1, 2015 00:00:00 UTC
const MAY_END = 1433116799;   // May 31, 2015 23:59:59 UTC

export const calculateRange = (workerId: number, workersTotal: number) => {
    const step = Math.floor((MAY_END - MAY_START + 1) / workersTotal);
    const rangeStart = MAY_START + workerId * step;
    const rangeEnd = workerId === workersTotal - 1 ? MAY_END : rangeStart + step - 1;
    return { rangeStart, rangeEnd };
};

export const mapRowToComment = (row: any) => ({
    id: row.id,
    name: row.name,
    link_id: row.link_id,
    parent_id: row.parent_id,
    subreddit_id: row.subreddit_id,
    subreddit: row.subreddit,
    author: row.author,
    author_flair_text: row.author_flair_text || null,
    author_flair_css_class: row.author_flair_css_class || null,
    body: row.body,
    created_utc: row.created_utc,
    retrieved_on: row.retrieved_on,
    ups: row.ups || 0,
    downs: row.downs || 0,
    score: row.score || 0,
    score_hidden: row.score_hidden === 1 || row.score_hidden,
    gilded: row.gilded || 0,
    archived: row.archived === 1 || row.archived,
    edited: row.edited === 1 || row.edited,
    controversiality: row.controversiality || 0,
    distinguished: row.distinguished || null,
    removal_reason: row.removal_reason || null
});
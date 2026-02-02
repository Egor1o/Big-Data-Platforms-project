const MAY_START = 1430438400; // May 1, 2015 00:00:00 UTC
const MAY_END = 1433116799;   // May 31, 2015 23:59:59 UTC

export const calculateRange = (workerId: number, workersTotal: number) => {
    const step = Math.floor((MAY_END - MAY_START + 1) / workersTotal);
    const rangeStart = MAY_START + workerId * step;
    const rangeEnd = workerId === workersTotal - 1 ? MAY_END : rangeStart + step - 1;
    return { rangeStart, rangeEnd };
};

function toBoolean(value: any): boolean {
    if (value === true || value === false) return value;
    if (value === null) return false;
    if (typeof value === "number") return true;
    if (typeof value === "string") return value === "true";
    return false;
}

export const mapRowToComment = (row: any) => ({
    id: row.id,
    name: row.name,
    link_id: row.link_id,
    parent_id: row.parent_id,
    subreddit_id: row.subreddit_id,
    subreddit: row.subreddit,
    author: row.author,
    author_flair_text: row.author_flair_text,
    author_flair_css_class: row.author_flair_css_class,
    body: row.body,
    created_utc: row.created_utc,
    retrieved_on: row.retrieved_on,
    ups: row.ups,
    downs: row.downs,
    score: row.score,

    score_hidden: toBoolean(row.score_hidden),
    gilded: row.gilded ?? 0,
    archived: toBoolean(row.archived),
    edited: toBoolean(row.edited),
    controversiality: row.controversiality ?? 0,
    distinguished: row.distinguished,
    removal_reason: row.removal_reason,
})
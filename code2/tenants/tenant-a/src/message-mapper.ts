export interface LikesMessage {
    id: string;
    subreddit: string;
    score: number;
    ups: number;
    downs: number;
    created_utc: number;
}

export function mapLikesMessage(msg: any): LikesMessage {
    if (!msg.id) throw new Error("Missing id");
    if (typeof msg.score !== "number") throw new Error("Invalid score");
    if (typeof msg.created_utc !== "number") throw new Error("Invalid timestamp");

    return {
        id: msg.id,
        subreddit: msg.subreddit,
        score: msg.score,
        ups: msg.ups ?? 0,
        downs: msg.downs ?? 0,
        created_utc: msg.created_utc,
    };
}
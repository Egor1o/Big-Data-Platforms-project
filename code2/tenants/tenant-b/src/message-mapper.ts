export interface ControversyMessage {
    id: string;
    subreddit: string;
    controversiality: number;
    removal_reason: string | null;
    body: string | null;
    created_utc: number;
}

export function mapControversyMessage(msg: any): ControversyMessage {
    if (!msg.id) throw new Error("Missing id");
    if (typeof msg.created_utc !== "number") throw new Error("Invalid timestamp");

    // controversiality may be missing in some rows - default to 0
    const controversiality =
        typeof msg.controversiality === "number"
            ? msg.controversiality
            : 0;

    return {
        id: msg.id,
        subreddit: msg.subreddit,
        controversiality,
        removal_reason: msg.removal_reason ?? null,
        body: msg.body ?? null,
        created_utc: msg.created_utc,
    };
}
// Messages between the page and the embedding worker. Documents are keyed by
// strings so tracks ("track:263") and scene labels ("setting:dungeon:0") can
// share one index.

export const EMBEDDING_MODEL = "Xenova/bge-small-en-v1.5";

export type ToEmbedWorker =
  | { type: "load" }
  /** Embed these documents for later queries (adds to the index). */
  | { type: "index"; docs: { key: string; text: string }[] }
  /** Rank `candidates` by similarity to `text`. */
  | { type: "query"; requestId: number; text: string; candidates: string[] };

export type FromEmbedWorker =
  | { type: "progress"; loaded: number; total: number }
  | { type: "indexed"; count: number; ms: number }
  | { type: "ranked"; requestId: number; ranked: { key: string; score: number }[]; ms: number }
  | { type: "error"; message: string; requestId?: number };

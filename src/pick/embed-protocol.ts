// Messages between the page and the embedding worker.

export const EMBEDDING_MODEL = "Xenova/bge-small-en-v1.5";
export const EMBEDDING_DOWNLOAD_MB = 34;

export type ToEmbedWorker =
  | { type: "load" }
  /** Embed these documents (tracks) for later queries. */
  | { type: "index"; docs: { id: number; text: string }[] }
  /** Rank `candidates` (or every document) by similarity to `text`. */
  | { type: "query"; requestId: number; text: string; candidates?: number[] };

export type FromEmbedWorker =
  | { type: "progress"; loaded: number; total: number }
  | { type: "indexed"; count: number; ms: number }
  | { type: "ranked"; requestId: number; ranked: { id: number; score: number }[]; ms: number }
  | { type: "error"; message: string; requestId?: number };

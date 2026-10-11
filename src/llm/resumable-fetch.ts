// Resumable model downloads, for the model workers (DESIGN.md 7.10).
// transformers.js lets us supply `fetch`: this one downloads each model file
// in pieces with HTTP Range requests, saves each piece to IndexedDB as it
// arrives, and hands transformers.js a stream it can read (and report
// progress on) as the pieces come. Pausing stops fetching; the load waits.
// Resuming, even after a reload, carries on from the last saved piece. Once
// a file is complete transformers.js caches it as usual, and the pieces go.

const PIECE = 16 * 1024 * 1024;
const DB_NAME = "eavesbard-downloads";
const STORE = "pieces";

let paused = false;
let resumed: (() => void) | undefined;
let resumeSignal: Promise<void> = Promise.resolve();
const inFlight = new Set<AbortController>();

/** Bytes that have arrived from the network (not read back from saved pieces), for the download speed. */
let network = 0;
const networkListeners: ((bytes: number) => void)[] = [];

/** Calls `listener` with the running total of bytes from the network, as they arrive. */
export function onNetworkBytes(listener: (bytes: number) => void): void {
  networkListeners.push(listener);
}

function counted(bytes: number): void {
  network += bytes;
  for (const listener of networkListeners) listener(network);
}

/** Pauses or resumes every download in this worker. */
export function setDownloadsPaused(on: boolean): void {
  if (on === paused) return;
  paused = on;
  if (on) {
    resumeSignal = new Promise((resolve) => (resumed = resolve));
    // Stop the pieces being fetched now; they start again on resume.
    for (const controller of inFlight) controller.abort();
  } else {
    resumed?.();
  }
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const request = run(d.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

const key = (url: string, total: number, index: number) => `${url}|${total}|${index}`;

/**
 * Fetches bytes [start, end] of `url`, retrying after a pause or a network
 * error. An HTTP error (e.g. 404 for an optional file transformers.js looks
 * for) comes back as it is, for the caller to handle.
 */
async function fetchPiece(url: string, start: number, end: number): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await resumeSignal;
    const controller = new AbortController();
    inFlight.add(controller);
    try {
      const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: controller.signal });
      if (response.status !== 206 && response.status !== 200) return response;
      // Read it all now, so a pause mid-piece aborts it cleanly, counting bytes as they come.
      const chunks: Uint8Array[] = [];
      const reader = response.body!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        counted(value.byteLength);
      }
      return new Response(new Blob(chunks as BlobPart[]), { status: response.status, headers: response.headers });
    } catch (err) {
      if (paused) continue; // Aborted by a pause: wait, then fetch the piece again.
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    } finally {
      inFlight.delete(controller);
    }
  }
}

/**
 * A fetch for transformers.js. Model files come in saved pieces; anything
 * that isn't a plain GET, or a server without byte ranges, goes through as is.
 */
export async function resumableFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" || new Headers(init?.headers).has("Range") || typeof indexedDB === "undefined") {
    return fetch(input, init);
  }
  const first = await fetchPiece(url, 0, PIECE - 1);
  // An error (e.g. 404), no byte ranges, or one piece holds it all: nothing to resume.
  if (first.status !== 206) return first;
  const total = Number(/\/(\d+)$/.exec(first.headers.get("Content-Range") ?? "")?.[1] ?? NaN);
  if (!Number.isFinite(total) || total <= PIECE) return new Response(await first.arrayBuffer(), { status: 200, headers: withoutRange(first.headers) });

  const pieces = Math.ceil(total / PIECE);
  const firstBytes = new Uint8Array(await first.arrayBuffer());
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let i = 0; i < pieces; i++) {
          let bytes: Uint8Array | undefined;
          if (i === 0) bytes = firstBytes;
          else {
            const saved = await idb<ArrayBuffer | undefined>("readonly", (s) => s.get(key(url, total, i)) as IDBRequest<ArrayBuffer | undefined>).catch(() => undefined);
            if (saved) bytes = new Uint8Array(saved);
            else {
              const start = i * PIECE;
              const piece = await fetchPiece(url, start, Math.min(total, start + PIECE) - 1);
              bytes = new Uint8Array(await piece.arrayBuffer());
              await idb("readwrite", (s) => s.put(bytes!.buffer, key(url, total, i))).catch(() => undefined);
            }
          }
          controller.enqueue(bytes);
        }
        controller.close();
        // transformers.js now caches the whole file; the pieces aren't needed.
        await idb("readwrite", (s) => s.delete(IDBKeyRange.bound(`${url}|${total}|`, `${url}|${total}|￿`))).catch(() => undefined);
      } catch (err) {
        controller.error(err);
      }
    },
  });
  const headers = withoutRange(first.headers);
  headers.set("Content-Length", String(total));
  return new Response(stream, { status: 200, headers });
}

/** A whole file's headers from a piece's: no Content-Range, and the length set by the caller. */
function withoutRange(from: Headers): Headers {
  const headers = new Headers(from);
  headers.delete("Content-Range");
  headers.delete("Content-Length");
  return headers;
}

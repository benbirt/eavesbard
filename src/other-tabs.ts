// Whether Eavesbard is also open in another tab or window of this browser
// profile (DESIGN.md 7.10). Each copy loads its own models, about 4 GB, and
// two copies can stall each other's loading, so a second copy says so and
// doesn't load models by itself. A private window is a separate profile, so
// it can't see copies in a normal one, or the other way round.

import { signal } from "@preact/signals";

type Message = { type: "hello" | "here" | "bye"; id: string };

/** How many other copies of the app are open. */
export const otherTabs = signal(0);

const HEARTBEAT_MS = 5000;
const id = Math.random().toString(36).slice(2);
const seen = new Map<string, number>();

function update(): void {
  const now = Date.now();
  for (const [other, at] of seen) if (now - at > 3 * HEARTBEAT_MS) seen.delete(other);
  otherTabs.value = seen.size;
}

if (typeof BroadcastChannel !== "undefined") {
  const channel = new BroadcastChannel("eavesbard");
  const send = (type: Message["type"]) => channel.postMessage({ type, id } satisfies Message);
  channel.onmessage = (e: MessageEvent<Message>) => {
    const m = e.data;
    if (!m || m.id === id) return;
    if (m.type === "bye") seen.delete(m.id);
    else seen.set(m.id, Date.now());
    if (m.type === "hello") send("here");
    update();
  };
  send("hello");
  setInterval(() => {
    send("here");
    update();
  }, HEARTBEAT_MS);
  addEventListener("pagehide", () => send("bye"));
}

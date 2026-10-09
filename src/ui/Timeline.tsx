import { useSignal } from "@preact/signals";
import { clearStored, exportJsonl, storageOk, timeline, type TimelineEntry, type TimelineKind } from "../timeline.js";

const pct = (x: number) => `${Math.round(x * 100)}%`;

const FILTERS: { kind: TimelineKind; label: string }[] = [
  { kind: "speech", label: "Speech" },
  { kind: "call", label: "Claude" },
  { kind: "decision", label: "Decisions" },
  { kind: "music", label: "Music" },
];

const ICONS: Record<TimelineKind, string> = {
  session: "●",
  speech: "🗣",
  call: "🤖",
  decision: "⚖️",
  music: "🎵",
  error: "⚠️",
};

function Body({ entry }: { entry: TimelineEntry }) {
  const e = entry.event;
  switch (e.kind) {
    case "session":
      return <strong>{e.text}</strong>;
    case "speech":
      return e.dropped ? (
        <span class="dropped">
          {e.text} <span class="muted">(dropped: {e.dropped})</span>
        </span>
      ) : (
        <span>{e.text}</span>
      );
    case "call":
      return (
        <div>
          {e.error ? (
            <span class="warning">
              {e.purpose === "opening" ? "Opening scene" : "Scene"} check failed: {e.error}
            </span>
          ) : (
            e.result && (
              <span>
                {e.purpose === "opening" ? "Opening scene: " : "Claude says: "}
                <strong>
                  {e.result.setting} ({pct(e.result.settingConfidence)}), {e.result.intensity} (
                  {pct(e.result.intensityConfidence)})
                </strong>{" "}
                “{e.result.reason}”{" "}
                <span class="muted">
                  {((e.latencyMs ?? 0) / 1000).toFixed(1)} s{e.costUsd !== undefined && `, $${e.costUsd.toFixed(5)}`}
                </span>
              </span>
            )
          )}
          <details>
            <summary class="muted">What was sent</summary>
            <pre>{e.userText}</pre>
          </details>
        </div>
      );
    case "decision":
      return (
        <div>
          {e.changed ? (
            <strong>
              Scene: {e.from.setting}, {e.from.intensity} → {e.to.setting}, {e.to.intensity}
            </strong>
          ) : (
            <span>No change.</span>
          )}
          <div class="muted">Setting: {e.notes.setting}</div>
          <div class="muted">Intensity: {e.notes.intensity}</div>
        </div>
      );
    case "music":
      return <span>{e.text}</span>;
    case "error":
      return <span class="warning">{e.text}</span>;
  }
}

export function Timeline() {
  const shown = useSignal<Set<TimelineKind>>(new Set(["speech", "call", "decision", "music"]));
  const showDropped = useSignal(false);
  const entries = timeline.value
    .filter((t) => {
      const e = t.event;
      if (e.kind === "session" || e.kind === "error") return true;
      if (e.kind === "speech" && e.dropped && !showDropped.value) return false;
      return shown.value.has(e.kind);
    })
    .slice(-400)
    .reverse();

  const toggle = (kind: TimelineKind, on: boolean) => {
    const next = new Set(shown.value);
    if (on) next.add(kind);
    else next.delete(kind);
    shown.value = next;
  };

  return (
    <section>
      <h2>Timeline</h2>
      <p class="filters">
        {FILTERS.map((f) => (
          <label class="inline" key={f.kind}>
            <input type="checkbox" checked={shown.value.has(f.kind)} onChange={(e) => toggle(f.kind, e.currentTarget.checked)} />{" "}
            {ICONS[f.kind]} {f.label}
          </label>
        ))}
        <label class="inline">
          <input type="checkbox" checked={showDropped.value} onChange={(e) => (showDropped.value = e.currentTarget.checked)} />{" "}
          Dropped speech
        </label>
      </p>
      {!storageOk.value && <p class="warning">This browser refused storage, so this session won't be saved for export.</p>}
      {entries.length === 0 ? (
        <p class="muted">Start a session to see what's heard, what Claude decides, and what plays.</p>
      ) : (
        <ol class="timeline">
          {entries.map((t) => (
            <li key={t.seq} class={`kind-${t.event.kind}`}>
              <span class="time muted">{new Date(t.at).toLocaleTimeString("en-GB")}</span>
              <span class="icon">{ICONS[t.event.kind]}</span>
              <div class="body">
                <Body entry={t} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <p>
        <button onClick={() => void exportJsonl(false)}>Export this session (JSONL)</button>{" "}
        <button onClick={() => void exportJsonl(true)}>Export all sessions</button>{" "}
        <button
          onClick={() => {
            if (confirm("Delete every saved session from this browser?")) void clearStored();
          }}
        >
          Clear saved sessions
        </button>
      </p>
      <p class="muted">
        Sessions, including transcripts, are saved in this browser until you clear them, and can be exported for
        tuning the classifier.
      </p>
    </section>
  );
}

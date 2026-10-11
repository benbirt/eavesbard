import { useSignal } from "@preact/signals";
import { useState } from "preact/hooks";
import { copyToClipboard, saveToFile, timeline, type TimelineEntry, type TimelineKind } from "../timeline.js";

const pct = (x: number) => `${Math.round(x * 100)}%`;

const FILTERS: { kind: TimelineKind; label: string }[] = [
  { kind: "speech", label: "Speech" },
  { kind: "decision", label: "Scene changes" },
  { kind: "music", label: "Music" },
  { kind: "call", label: "Model details" },
  { kind: "playback", label: "Playback details" },
];

const ICONS: Record<TimelineKind, string> = {
  session: "●",
  speech: "🗣",
  call: "🤖",
  decision: "⚖️",
  music: "🎵",
  error: "⚠️",
  playback: "🔊",
};

function Body({ entry }: { entry: TimelineEntry }) {
  const e = entry.event;
  switch (e.kind) {
    case "playback":
      return (
        <span class="muted">
          {e.output === "cast" ? "Cast" : "This computer"}: {e.type === "info" ? "" : `${e.type} · `}
          {e.detail}
        </span>
      );
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
          {e.comparison && <span class="badge-small">comparison</span>}
          {e.error ? (
            <span class="warning">
              {e.model.startsWith("local") ? "Local model" : "Claude"}:{" "}
              {e.purpose === "opening" ? "opening scene" : e.purpose === "pick" ? "track pick" : "scene check"} failed:{" "}
              {e.error}
            </span>
          ) : e.pick ? (
            <span>
              Claude picks <strong>{e.pick.title}</strong> “{e.pick.reason}”{" "}
              <span class="muted">
                {((e.latencyMs ?? 0) / 1000).toFixed(1)} s{e.costUsd !== undefined && `, $${e.costUsd.toFixed(5)}`}
              </span>
            </span>
          ) : (
            e.result && (
              <span>
                {e.model.startsWith("local") ? "Local model" : "Claude"}
                {e.purpose === "opening" ? " reads the opening as " : " says: "}
                <strong>
                  {e.result.setting} ({pct(e.result.settingConfidence)}), {e.result.intensity} (
                  {pct(e.result.intensityConfidence)})
                </strong>{" "}
                “{e.result.reason}”{" "}
                <span class="muted">
                  {((e.latencyMs ?? 0) / 1000).toFixed(1)} s{e.costUsd ? `, $${e.costUsd.toFixed(5)}` : ""}
                </span>
              </span>
            )
          )}
          {e.userText && (
            <details>
              <summary class="muted">What was sent</summary>
              <pre>{e.userText}</pre>
            </details>
          )}
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

/** Save the session to a file, or copy it, e.g. to share a bug report. */
function ExportButtons() {
  const [copied, setCopied] = useState<"" | "copied" | "failed">("");
  const empty = timeline.value.length === 0;
  return (
    <p>
      <button type="button" class="btn" disabled={empty} onClick={saveToFile}>
        Save to a file
      </button>{" "}
      <button
        type="button"
        class="btn"
        disabled={empty}
        onClick={() =>
          copyToClipboard().then(
            () => setCopied("copied"),
            () => setCopied("failed"),
          )
        }
      >
        Copy to clipboard
      </button>{" "}
      <span class="small" role="status">
        {copied === "copied" ? "Copied." : copied === "failed" ? "The browser didn't allow copying." : ""}
      </span>
    </p>
  );
}

export function Timeline() {
  const shown = useSignal<Set<TimelineKind>>(new Set(["speech", "decision", "music"]));
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
    <>
      <div class="pills" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button type="button" class="pill" key={f.kind} aria-pressed={shown.value.has(f.kind)} onClick={() => toggle(f.kind, !shown.value.has(f.kind))}>
            {f.label}
          </button>
        ))}
        <button type="button" class="pill" aria-pressed={showDropped.value} onClick={() => (showDropped.value = !showDropped.value)}>
          Dropped speech
        </button>
      </div>
      {entries.length === 0 ? (
        <p class="small">Start a session to see what's heard, what's decided and what plays.</p>
      ) : (
        <ol class="log">
          {entries.map((t) => (
            <li key={t.seq} class={`kind-${t.event.kind}`}>
              <time>{new Date(t.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</time>
              <span aria-hidden="true">{ICONS[t.event.kind]}</span>
              <div class="body">
                <Body entry={t} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <ExportButtons />
      <p class="small">This session's log, transcript included, is kept only until you close or reload the page.</p>
    </>
  );
}

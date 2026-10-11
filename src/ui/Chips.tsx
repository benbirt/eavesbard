import type { ComponentChildren } from "preact";
import { effectiveEngine, sessionCost } from "../director.js";
import { downloadsPaused, knownDownloaded, setDownloadsPaused } from "../downloads.js";
import { hasWebGpu } from "../gpu.js";
import { model, speaking, speechModel, state, wakeLock } from "../listener.js";
import { SCENE_LLM } from "../llm/llm-protocol.js";
import { sceneLlm } from "../llm/scene-llm.js";
import { localModel } from "../local-models.js";
import { EMBEDDING_MODEL } from "../pick/embed-protocol.js";
import { isWebSpeech, whisperRepo, WHISPER_DOWNLOAD_MB, type WhisperModel } from "../stt/protocol.js";


/** "rec": listening, shown red like a browser's recording indicator. */
type Tone = "ok" | "busy" | "warn" | "off" | "rec";

function Chip({ tone, pulse = false, children, title, extra }: { tone: Tone; pulse?: boolean; children: ComponentChildren; title?: string; extra?: string }) {
  return (
    <span class={`chip ${tone}${extra ? ` ${extra}` : ""}`} title={title} role="status">
      <span class={`dot${pulse ? " hearing" : ""}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/** A model not loading yet: about to load from the browser, still being checked, or not downloaded. */
function notLoaded(repo: string): string {
  const downloaded = knownDownloaded(repo);
  return downloaded ? "loading" : downloaded === undefined ? "checking" : "not downloaded";
}

/** The highest percentage shown so far for each model's download, so it never goes backwards. */
const peaks = new Map<string, number>();
/** Recent (time, bytes) readings for each model's download, for its speed. */
const readings = new Map<string, { t: number; loaded: number }[]>();

/** Clears a model's download figures once it's no longer downloading. */
function forget(repo: string): void {
  peaks.delete(repo);
  readings.delete(repo);
}

/** Whisper's known download size, for its progress. */
const whisperBytes = () => (isWebSpeech(model.value) ? 0 : WHISPER_DOWNLOAD_MB[model.value as WhisperModel] * 1e6);

/** Roughly how fast a download is going, over the last few seconds: "12 MB/s", or "" until known. */
function speed(repo: string, loaded: number): string {
  const now = performance.now();
  let list = readings.get(repo) ?? [];
  // Fewer bytes than before: the figure restarted (another file), so start measuring again.
  if (list.length && loaded < list.at(-1)!.loaded) list = [];
  if (!list.length || list.at(-1)!.loaded !== loaded) list.push({ t: now, loaded });
  while (list.length > 2 && now - list[0]!.t > 4000) list.shift();
  readings.set(repo, list);
  const first = list[0]!;
  const last = list.at(-1)!;
  const seconds = (last.t - first.t) / 1000;
  if (seconds < 1) return "";
  const mbps = (last.loaded - first.loaded) / 1e6 / seconds;
  return `${mbps >= 10 ? mbps.toFixed(0) : mbps.toFixed(1)} MB/s`;
}

/**
 * How far a download has got, as the chips show it. The percentage is of at
 * least the model's known download size, and never goes backwards: the
 * workers' own totals start with the few small files seen so far, which
 * would read as 100% before the big ones begin.
 */
function progress(m: { loaded: number; total: number; preparing: boolean }, repo: string, expectedBytes: number): string {
  if (m.preparing) return "preparing";
  // Already downloaded: the progress is the browser reading its own cache.
  if (knownDownloaded(repo)) return "loading";
  const pct = Math.min(99, Math.floor((100 * m.loaded) / Math.max(m.total, expectedBytes)));
  const shown = Math.max(pct, peaks.get(repo) ?? 0);
  peaks.set(repo, shown);
  if (downloadsPaused.value) return `paused at ${shown}%`;
  const rate = speed(repo, m.loaded);
  return `downloading ${shown}%${rate ? ` · ${rate}` : ""}`;
}

const speechName = () => (isWebSpeech(model.value) ? "the browser's speech recognition" : `Whisper ${model.value.replace(".en", "")}`);

/** The listener: whether it can listen, is listening, or can hear anyone. Model details are in the tooltip. */
export function ListeningChip() {
  const speech = speechModel.value;
  if (!isWebSpeech(model.value) && state.value.phase !== "loading" && speech.phase !== "loading") forget(whisperRepo(model.value as WhisperModel));
  const s = state.value;
  const name = speechName();
  if (s.phase === "error") return <Chip tone="warn" title={s.message}><b>Listener</b> · problem</Chip>;
  if (s.phase === "loading") return <Chip tone="busy" title={name}><b>Listener</b> · {s.preparing || !s.total ? "starting" : progress(s, whisperRepo(model.value as WhisperModel), whisperBytes())}</Chip>;
  if (s.phase === "listening") {
    if (wakeLock.value === "lost") {
      return <Chip tone="warn" pulse={speaking.value} title="The screen may sleep and stop the listening: keep this tab visible"><b>Listener</b> · listening, keep this tab visible</Chip>;
    }
    return <Chip tone="rec" pulse={speaking.value} title={name}><b>Listener</b> · {speaking.value ? "hearing speech" : "listening"}</Chip>;
  }
  if (isWebSpeech(model.value)) return <Chip tone="ok" title={name}><b>Listener</b> · ready</Chip>;
  const m = speechModel.value;
  if (m.phase === "loading") return <Chip tone="busy" title={name}><b>Listener</b> · {progress(m, whisperRepo(model.value as WhisperModel), whisperBytes())}</Chip>;
  if (m.phase === "error") return <Chip tone="warn" title={`${name}: ${m.message}`}><b>Listener</b> · problem</Chip>;
  if (m.phase === "ready") return <Chip tone="ok" title={name}><b>Listener</b> · ready</Chip>;
  return <Chip tone="off" title={name}><b>Listener</b> · {notLoaded(whisperRepo(model.value as WhisperModel))}</Chip>;
}

/** The scene model: who decides the scene, and whether it's ready. Model details are in the tooltip. */
export function ModelChip() {
  if (sceneLlm.value.phase !== "loading") forget(SCENE_LLM.repo);
  if (effectiveEngine() === "claude") {
    const c = sessionCost.value;
    return <Chip tone="ok" extra="model" title="Claude decides the scene"><b>Scenes</b> · Claude{c.calls ? `, $${c.usd.toFixed(3)} so far` : ""}</Chip>;
  }
  const llm = sceneLlm.value;
  const embed = localModel.value;
  const name = `${SCENE_LLM.name} with embeddings, on this computer`;
  if (llm.phase === "error" || embed.phase === "error") {
    const message = llm.phase === "error" ? llm.message : embed.phase === "error" ? embed.message : "";
    return <Chip tone="warn" extra="model" title={message}><b>Scenes</b> · problem</Chip>;
  }
  if (!hasWebGpu) {
    return <Chip tone={embed.phase === "ready" || embed.phase === "indexing" ? "ok" : "off"} extra="model" title="No WebGPU in this browser, so only the embedding model decides: less accurate"><b>Scenes</b> · basic</Chip>;
  }
  if (llm.phase === "loading") return <Chip tone="busy" extra="model" title={name}><b>Scenes</b> · {progress(llm, SCENE_LLM.repo, SCENE_LLM.downloadMb * 1e6)}</Chip>;
  if (llm.phase === "ready") {
    const indexing = embed.phase === "indexing" ? `; indexing tracks for picking (${embed.done} of ${embed.total})` : "";
    return <Chip tone="ok" extra="model" title={name + indexing}><b>Scenes</b> · ready</Chip>;
  }
  return <Chip tone="off" extra="model" title={name}><b>Scenes</b> · {notLoaded(SCENE_LLM.repo)}</Chip>;
}

/** Whether any model is downloading right now (not just preparing on the GPU). */
function downloading(): boolean {
  const speech = speechModel.value;
  const llm = sceneLlm.value;
  // Loading a model that's already downloaded reads the cache: nothing to pause.
  const fresh = (repo: string) => knownDownloaded(repo) === false;
  return (
    (speech.phase === "loading" && !speech.preparing && !isWebSpeech(model.value) && fresh(whisperRepo(model.value as WhisperModel))) ||
    (llm.phase === "loading" && !llm.preparing && fresh(SCENE_LLM.repo)) ||
    (localModel.value.phase === "loading" && fresh(EMBEDDING_MODEL))
  );
}

/** Pause or resume model downloads, shown while any is under way. A resumed download carries on where it stopped. */
export function DownloadControl() {
  if (!downloadsPaused.value && !downloading()) return null;
  const paused = downloadsPaused.value;
  return (
    <button
      type="button"
      class="iconbtn"
      title={paused ? "Resume downloading the models, from where they stopped" : "Pause the model downloads; resume later, even after a reload"}
      onClick={() => setDownloadsPaused(!paused)}
    >
      {paused ? "▶ Resume downloads" : "⏸ Pause downloads"}
    </button>
  );
}

import type { ComponentChildren } from "preact";
import { effectiveEngine, sessionCost } from "../director.js";
import { downloadsPaused, knownDownloaded, setDownloadsPaused } from "../downloads.js";
import { hasWebGpu } from "../gpu.js";
import { model, speaking, speechModel, state, wakeLock } from "../listener.js";
import { SCENE_LLM } from "../llm/llm-protocol.js";
import { sceneLlm } from "../llm/scene-llm.js";
import { localModel } from "../local-models.js";
import { EMBEDDING_MODEL } from "../pick/embed-protocol.js";
import { isWebSpeech, whisperRepo, type WhisperModel } from "../stt/protocol.js";


type Tone = "ok" | "busy" | "warn" | "off";

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

/** How far a download has got, as the chips show it. */
function progress(m: { loaded: number; total: number; preparing: boolean }, repo: string): string {
  if (m.preparing) return "preparing";
  // Already downloaded: the progress is the browser reading its own cache.
  if (knownDownloaded(repo)) return "loading";
  const pct = m.total ? `${Math.floor((100 * m.loaded) / m.total)}%` : "";
  return downloadsPaused.value ? `paused${pct ? ` at ${pct}` : ""}` : `downloading${pct ? ` ${pct}` : ""}`;
}

const speechName = () => (isWebSpeech(model.value) ? "the browser's speech recognition" : `Whisper ${model.value.replace(".en", "")}`);

/** The listener: whether it can listen, is listening, or can hear anyone. Model details are in the tooltip. */
export function ListeningChip() {
  const s = state.value;
  const name = speechName();
  if (s.phase === "error") return <Chip tone="warn" title={s.message}><b>Listener</b> · problem</Chip>;
  if (s.phase === "loading") return <Chip tone="busy" title={name}><b>Listener</b> · {s.preparing || !s.total ? "starting" : progress(s, whisperRepo(model.value as WhisperModel))}</Chip>;
  if (s.phase === "listening") {
    if (wakeLock.value === "lost") {
      return <Chip tone="warn" pulse={speaking.value} title="The screen may sleep and stop the listening: keep this tab visible"><b>Listener</b> · listening, keep this tab visible</Chip>;
    }
    return <Chip tone="ok" pulse={speaking.value} title={name}><b>Listener</b> · {speaking.value ? "hearing speech" : "listening"}</Chip>;
  }
  if (isWebSpeech(model.value)) return <Chip tone="ok" title={name}><b>Listener</b> · ready</Chip>;
  const m = speechModel.value;
  if (m.phase === "loading") return <Chip tone="busy" title={name}><b>Listener</b> · {progress(m, whisperRepo(model.value as WhisperModel))}</Chip>;
  if (m.phase === "error") return <Chip tone="warn" title={`${name}: ${m.message}`}><b>Listener</b> · problem</Chip>;
  if (m.phase === "ready") return <Chip tone="ok" title={name}><b>Listener</b> · ready</Chip>;
  return <Chip tone="off" title={name}><b>Listener</b> · {notLoaded(whisperRepo(model.value as WhisperModel))}</Chip>;
}

/** The scene model: who decides the scene, and whether it's ready. Model details are in the tooltip. */
export function ModelChip() {
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
  if (llm.phase === "loading") return <Chip tone="busy" extra="model" title={name}><b>Scenes</b> · {progress(llm, SCENE_LLM.repo)}</Chip>;
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

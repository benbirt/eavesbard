import type { ComponentChildren } from "preact";
import { effectiveEngine, sessionActive, sessionCost } from "../director.js";
import { hasWebGpu } from "../gpu.js";
import { model, speaking, speechModel, state, wakeLock } from "../listener.js";
import { SCENE_LLM } from "../llm/llm-protocol.js";
import { sceneLlm } from "../llm/scene-llm.js";
import { localModel } from "../local-models.js";
import { isWebSpeech } from "../stt/protocol.js";

const MB = 1e6;
const GB = 1e9;

type Tone = "ok" | "busy" | "warn" | "off";

function Chip({ tone, pulse = false, children, title, extra }: { tone: Tone; pulse?: boolean; children: ComponentChildren; title?: string; extra?: string }) {
  return (
    <span class={`chip ${tone}${extra ? ` ${extra}` : ""}`} title={title} role="status">
      <span class={`dot${pulse ? " hearing" : ""}`} aria-hidden="true" />
      {children}
    </span>
  );
}

const speechName = () => (isWebSpeech(model.value) ? "Web Speech" : `Whisper ${model.value.replace(".en", "")}`);

/** Whether the app is listening, and whether it can hear anyone. */
export function ListeningChip() {
  const s = state.value;
  if (s.phase === "error") return <Chip tone="warn" title={s.message}><b>Not listening</b> · {s.message}</Chip>;
  if (s.phase === "loading") {
    return (
      <Chip tone="busy">
        <b>Loading {speechName()}</b>
        {s.preparing ? " · preparing" : s.total ? ` · ${(s.loaded / MB).toFixed(0)} of ${(s.total / MB).toFixed(0)} MB` : ""}
      </Chip>
    );
  }
  if (s.phase === "listening") {
    if (wakeLock.value === "lost") return <Chip tone="warn" pulse={speaking.value}><b>Listening</b> · keep this tab visible or the screen may sleep</Chip>;
    return (
      <Chip tone="ok" pulse={speaking.value}>
        <b>{speaking.value ? "Hearing speech" : "Listening"}</b> · {speechName()}
      </Chip>
    );
  }
  const m = speechModel.value;
  if (!isWebSpeech(model.value) && m.phase === "loading") {
    return (
      <Chip tone="busy">
        <b>Not listening</b> · {speechName()} {m.preparing ? "preparing" : m.total ? `${(m.loaded / MB).toFixed(0)} of ${(m.total / MB).toFixed(0)} MB` : "downloading"}
      </Chip>
    );
  }
  if (!isWebSpeech(model.value) && m.phase === "error") {
    return <Chip tone="warn" title={m.message}><b>Not listening</b> · {speechName()} didn't load</Chip>;
  }
  return <Chip tone="off"><b>Not listening</b>{!isWebSpeech(model.value) && m.phase === "ready" ? ` · ${speechName()} ready` : ""}</Chip>;
}

/** Who decides the scene, and whether it's ready. */
export function ModelChip() {
  if (effectiveEngine() === "claude") {
    const c = sessionCost.value;
    return <Chip tone="ok" extra="model"><b>Claude</b>{c.calls ? ` · $${c.usd.toFixed(3)} this session` : " · ready"}</Chip>;
  }
  if (!hasWebGpu) return <Chip tone="warn" extra="model" title="Gemma needs WebGPU: use an up-to-date Chrome."><b>Embeddings only</b> · no WebGPU</Chip>;
  const llm = sceneLlm.value;
  const embed = localModel.value;
  if (llm.phase === "error" || embed.phase === "error") {
    return <Chip tone="warn" extra="model" title={llm.phase === "error" ? llm.message : embed.phase === "error" ? embed.message : ""}><b>Scene model problem</b> · see the log</Chip>;
  }
  if (llm.phase === "loading") {
    return (
      <Chip tone="busy" extra="model">
        <b>{SCENE_LLM.name}</b> · {llm.preparing ? "preparing" : `${(llm.loaded / GB).toFixed(1)} of ${(Math.max(llm.total, SCENE_LLM.downloadMb * MB) / GB).toFixed(1)} GB`}
      </Chip>
    );
  }
  if (llm.phase === "ready" && embed.phase === "indexing") {
    // Scene checks can run already; local track picks wait for this.
    return (
      <Chip tone="busy" extra="model" title="Scene checks can run; picking tracks by their descriptions waits for this">
        <b>{SCENE_LLM.name}</b> · indexing tracks {embed.done} of {embed.total}
      </Chip>
    );
  }
  if (llm.phase === "ready" && embed.phase === "loading") {
    return <Chip tone="busy" extra="model"><b>{SCENE_LLM.name}</b> · loading the embedding model</Chip>;
  }
  if (llm.phase === "ready") return <Chip tone="ok" extra="model"><b>{SCENE_LLM.name}</b> + embeddings · ready</Chip>;
  return <Chip tone="off" extra="model"><b>{SCENE_LLM.name}</b> · {sessionActive.value ? "starting" : "downloads when needed"}</Chip>;
}

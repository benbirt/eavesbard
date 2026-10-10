import { hasWebGpu } from "../gpu.js";
import { SCENE_LLM } from "../llm/llm-protocol.js";
import { sceneLlm } from "../llm/scene-llm.js";

const MB = 1e6;

/** What local scene checks use (in the setup section). */
export function SceneLlmInfo() {
  return (
    <p>
      Local scene model: {SCENE_LLM.name} (about {(SCENE_LLM.downloadMb / 1000).toFixed(1)} GB once, needs WebGPU){" "}
      <span class="muted">
        with the embedding model, which catches fights starting. Downloaded once, then cached by the browser.
      </span>
      {!hasWebGpu && <NoWebGpu />}
    </p>
  );
}

function NoWebGpu() {
  return (
    <span class="warning">
      {" "}
      This browser has no WebGPU, so {SCENE_LLM.name} can't run here. Local scene checks fall back to the embeddings
      alone, which often miss fights ending. Use an up-to-date Chrome, or Claude.
    </span>
  );
}

/** Download progress, errors and the no-WebGPU fallback, for the "now" strip. */
export function SceneLlmStatus() {
  const s = sceneLlm.value;
  if (!hasWebGpu) return <p><NoWebGpu /></p>;
  if (s.phase === "error") return <p class="warning">{s.message} Scene checks use the embeddings alone.</p>;
  if (s.phase !== "loading") return null;
  const max = Math.max(s.total, SCENE_LLM.downloadMb * MB);
  return (
    <div class="progress">
      <progress value={s.preparing ? undefined : s.loaded} max={max} />
      <span class="muted">
        {s.preparing
          ? `Preparing ${SCENE_LLM.name} for your graphics card…`
          : `Loading ${SCENE_LLM.name}: ${(s.loaded / MB).toFixed(0)} of about ${(max / MB).toFixed(0)} MB. ` +
            "Scene checks use the embeddings alone until it's ready."}
      </span>
    </div>
  );
}

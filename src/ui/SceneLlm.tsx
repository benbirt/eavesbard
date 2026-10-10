import { SCENE_LLMS, SCENE_LLM_IDS, type SceneLlm } from "../llm/llm-protocol.js";
import { hasWebGpu, sceneLlm, sceneLlmChoice, setSceneLlm } from "../llm/scene-llm.js";

const MB = 1e6;

const size = (id: SceneLlm) => `about ${(SCENE_LLMS[id].downloadMb / 1000).toFixed(1)} GB once, needs WebGPU`;

/** Which LLM works with the embeddings in local scene checks (in the setup section). */
export function SceneLlmChooser() {
  const choice = sceneLlmChoice.value;
  return (
    <p>
      Local scene model:{" "}
      {SCENE_LLM_IDS.length > 1 ? (
        <select value={choice} onChange={(e) => setSceneLlm(e.currentTarget.value as SceneLlm)}>
          {SCENE_LLM_IDS.map((id) => (
            <option key={id} value={id}>
              {SCENE_LLMS[id].name} ({size(id)})
            </option>
          ))}
        </select>
      ) : (
        <>
          {SCENE_LLMS[choice].name} ({size(choice)})
        </>
      )}{" "}
      <span class="muted">
        with the embedding model, which catches fights starting; the LLM is better at settings and at fights ending.
        Downloaded once, then cached by the browser. Results: experiments/E9.md.
      </span>
      {!hasWebGpu && <NoWebGpu />}
    </p>
  );
}

function NoWebGpu() {
  return (
    <span class="warning">
      {" "}
      This browser has no WebGPU, so {SCENE_LLMS[sceneLlmChoice.value].name} can't run here. Local scene checks fall back
      to the embeddings alone, which often miss fights ending. Use an up-to-date Chrome, or Claude.
    </span>
  );
}

/** Download progress, errors and the no-WebGPU fallback, for the "now" strip. */
export function SceneLlmStatus() {
  const s = sceneLlm.value;
  const choice = sceneLlmChoice.value;
  const name = SCENE_LLMS[choice].name;
  if (!hasWebGpu) return <p><NoWebGpu /></p>;
  if (s.phase === "error") return <p class="warning">{s.message} Scene checks use the embeddings alone.</p>;
  if (s.phase !== "loading") return null;
  const max = Math.max(s.total, SCENE_LLMS[choice].downloadMb * MB);
  return (
    <div class="progress">
      <progress value={s.preparing ? undefined : s.loaded} max={max} />
      <span class="muted">
        {s.preparing
          ? `Preparing ${name} for your graphics card…`
          : `Loading ${name}: ${(s.loaded / MB).toFixed(0)} of about ${(max / MB).toFixed(0)} MB. ` +
            "Scene checks use the embeddings alone until it's ready."}
      </span>
    </div>
  );
}

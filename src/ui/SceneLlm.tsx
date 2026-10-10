import { SCENE_LLMS, SCENE_LLM_IDS } from "../llm/llm-protocol.js";
import { hasWebGpu, sceneLlm, sceneLlmChoice, setSceneLlm, type SceneLlmChoice } from "../llm/scene-llm.js";
import { EMBEDDING_DOWNLOAD_MB } from "../pick/embed-protocol.js";

const MB = 1e6;

const NOTES: Record<SceneLlmChoice, string> = {
  none: "fast, works in any browser and on phones; weaker at telling settings apart",
  "gemma-3-4b": "recommended on laptops: much better at settings and tense scenes",
};

/** Chooses the helper LLM for local scene checks (in the setup section). */
export function SceneLlmChooser() {
  return (
    <label>
      Local scene model{" "}
      <select value={sceneLlmChoice.value} onChange={(e) => setSceneLlm(e.currentTarget.value as SceneLlmChoice)}>
        <option value="none">
          Embeddings only (about {EMBEDDING_DOWNLOAD_MB} MB): {NOTES.none}
        </option>
        {SCENE_LLM_IDS.map((id) => (
          <option key={id} value={id} disabled={!hasWebGpu}>
            Embeddings + {SCENE_LLMS[id].name} (about {(SCENE_LLMS[id].downloadMb / 1000).toFixed(1)} GB, needs WebGPU):{" "}
            {NOTES[id]}
          </option>
        ))}
      </select>{" "}
      <span class="muted">
        Used when the models are local. Downloaded once, then cached by the browser; until then the embeddings decide
        alone. Results: experiments/E9.md.
      </span>
    </label>
  );
}

/** Download progress and errors, for the "now" strip. */
export function SceneLlmStatus() {
  const s = sceneLlm.value;
  const choice = sceneLlmChoice.value;
  if (choice === "none") return null;
  const name = SCENE_LLMS[choice].name;
  if (s.phase === "error") return <p class="warning">{s.message}</p>;
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

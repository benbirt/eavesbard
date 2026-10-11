import { hasWebGpu } from "../gpu.js";
import { SCENE_LLM } from "../llm/llm-protocol.js";

/** What "on this computer" means for scene decisions (in Setup). */
export function LocalModelsNote() {
  return (
    <>
      {SCENE_LLM.name} with embeddings · about {(SCENE_LLM.downloadMb / 1000).toFixed(1)} GB once · free and private
      {!hasWebGpu && (
        <span class="warning">
          {" "}
          · this browser has no WebGPU, so only the embeddings run, which often miss fights ending
        </span>
      )}
    </>
  );
}

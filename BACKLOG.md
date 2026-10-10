# Backlog

Work agreed but not started, roughly in order. Design detail lives in DESIGN.md; experiment results in `experiments/`.

## 1. Repo cleanup

Remove code and docs that belong to superseded versions. Keep experiment infrastructure (`experiments/`, `src/eval/`, `//src:eval_site`).

- Gemma 3 and Qwen leftovers in app code and comments (`emptyThought` exists only for Qwen3; the model list has one entry, so the `SceneLlmChooser` select branch is dead).
- The old embeddings-only evaluation page (`src/eval/local-eval.ts`, `//src:local_eval`), superseded by `src/eval/llm-eval.ts`.
- Duplicated helpers, such as the WebGPU check in `listener.ts` and `llm/scene-llm.ts`, and unused exports such as `EMBEDDING_DOWNLOAD_MB`.
- DESIGN.md: shorten history that no longer describes the app (7.4 keyword triggers, round-1 E9 details now in `experiments/E9.md`) so it reads as the current design.
- Re-tune the blend (weights, softening temperature, fight-over threshold) for Gemma 4: they were chosen for Gemma 3.

## 2. Model experiments (E9, round 3)

Each takes about 10 minutes with `experiments/e9/browser-eval.mjs` on a local GPU.

- The JSON "soundtrack" prompt, plus a line saying off-topic table talk (rules, food, scheduling) means keep the current soundtrack. It's the best prompt alone (85%), and off-topic is its weak spot.
- The same prompt blended with the embeddings, against the shipped 83%.
- Google's 2-bit Gemma 4 E2B build (`onnx-community/gemma-4-E2B-it-qat-mobile-ONNX`, about 2.3 GB) against the 4-bit one (about 3.1 GB): accuracy, speed, download.
- Gemma 4 alone (no embeddings) once the prompt handles fights starting and off-topic chat. If it matches the blend, scene checks need only Gemma (the embeddings would still pick tracks).

## 3. Gemma 4 instead of Whisper (new experiment E11)

Gemma 4 E2B takes audio input (its ONNX package includes an audio encoder, about 170 MB at 4-bit). If it transcribes table talk well enough, the app needs one model fewer (Whisper base is 205 MB) and one fewer pipeline.

Questions to answer first:
- Does transformers.js 4.3.1 support Gemma 4's audio input in the browser, and how long a clip can it take?
- Transcription quality against Whisper on real table audio (crosstalk, distance, music playing), and its tendency to invent text from music.
- Latency and GPU contention: transcription and scene checks would share one model on one GPU.
- Keep Silero VAD for segmenting either way.

Two shapes, in order of preference:
- **Gemma transcribes**, everything else unchanged: the transcript still feeds the timeline, the embeddings and track picks.
- **Gemma judges the scene straight from audio**: simpler, but loses the transcript, which the timeline and debugging rely on.

## 4. UI cleanup, and make it pretty

- Tidy the layout and settings now that the options have settled. For example, the setup text still carries rationale and numbers that belong in the docs.
- A proper visual design, ideally with interesting art: for example, a backdrop that changes with the setting and intensity.
- Art options:
  - SVG drawn by the LLM: Gemma 4 can only write text, but SVG is text; quality from a 2B model is uncertain.
  - Art generated once with Claude (or another image model) and committed, one piece per setting and intensity.
  - Generated live per scene with Claude when there's an API key.

## Smaller items

- Test the Web Speech options (on-device and cloud) in Chrome on the phone and the laptop.
- Phones: whether Gemma 4 E2B (3.1 GB) plus Whisper fits and keeps up on Android; if not, a lighter default there.
- Score Claude Haiku on the held-out set as a reference (needs an API key).
- Grow the held-out set from real session logs, especially fights starting and ending.
- Qwen3 1.7B needs a re-packed copy hosted to load in the browser; probably not worth it now that Gemma 4 E2B scores better.
- Remaining design experiments: Cast from desktop Chrome (E1), Whisper model choice and microphones (E5, E6), a full session's browser behaviour (E10).

# Backlog

Work agreed but not started, roughly in order. Design detail lives in DESIGN.md; experiment results in `experiments/`.

## 1. Repo cleanup

Done.

## 2. Model experiments (E9, round 3)

Done: the blend is re-tuned for Gemma 4 E2B (92% on held-out scenes, up from 83%); the JSON prompt, its off-topic line and the 2-bit build didn't beat it; the embeddings stay. See experiments/E9.md.

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
- Art: an open-licensed library of fantasy illustrations, one or more per setting and intensity, chosen to match the scene. Check each licence allows reuse in a public web app, and credit the artists (alongside Tabletop Audio's attribution). Generated art (including SVG from the LLM) was considered and set aside.

## Smaller items

- Test the Web Speech options (on-device and cloud) in Chrome on the phone and the laptop.
- Phones: whether Gemma 4 E2B (3.1 GB) plus Whisper fits and keeps up on Android; if not, a lighter default there.
- Score Claude Haiku on the held-out set as a reference (needs an API key).
- Grow the held-out set from real session logs, especially fights starting and ending.
- Remaining design experiments: Cast from desktop Chrome (E1), Whisper model choice and microphones (E5, E6), a full session's browser behaviour (E10).

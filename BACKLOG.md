# Backlog

Work agreed but not started, roughly in order. Design detail lives in DESIGN.md; experiment results in `experiments/`.

## 1. Repo cleanup

Done.

## 2. Model experiments (E9, round 3)

Done: the blend is re-tuned for Gemma 4 E2B (92% on held-out scenes, up from 83%); the JSON prompt, its off-topic line and the 2-bit build didn't beat it; the embeddings stay. See experiments/E9.md.

## 2b. One choice for local or remote

Setup currently has two model choices: Models (Local or Claude, for scene checks and track picks) and the speech model (Whisper or Web Speech). Ideally one choice covers both: "Local" (Gemma for speech and scenes) or "Remote" (cloud speech-to-text plus Claude). Claude's API doesn't take audio, so "Remote" would pair Claude with a speech service: Web Speech's cloud mode (Google, no key) or a paid speech API. With Gemma staying out of speech-to-text (section 3), "Local" means Whisper plus Gemma.

## 3. Gemma 4 instead of Whisper (E11)

Done, not adopted: Gemma 4 E2B transcribes worse than Whisper (21% word errors on clean test clips, against 11% for Whisper base and 7% for Whisper small) and is no faster. See experiments/E11.md. Follow-ups:
- Whisper small is now the default. Check it keeps up on Android; if not, pick base there.
- Test with real table recordings rather than text-to-speech.

## 4. UI cleanup, and make it pretty

Done: a redesign around the scene art (DESIGN.md 7.10), with setting the scene by hand. Follow-ups:
- Check listening on a real Chrome after the redesign: in headless Chrome, Whisper's warm-up never finished, with or without Gemma loaded (the speech code didn't change).
- More art per intensity, especially tense (three images), and a few with known artists.

## Smaller items

- Test the Web Speech options (on-device and cloud) in Chrome on the phone and the laptop.
- Phones: whether Gemma 4 E2B (3.1 GB) plus Whisper fits and keeps up on Android; if not, a lighter default there.
- Score Claude Haiku on the held-out set as a reference (needs an API key).
- Grow the held-out set from real session logs, especially fights starting and ending.
- Remaining design experiments: Cast from desktop Chrome (E1), Whisper model choice and microphones (E5, E6), a full session's browser behaviour (E10).

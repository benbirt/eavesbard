# Backlog

Work agreed but not started, roughly in order. Design detail lives in DESIGN.md; experiment results in `experiments/`.

## 1. One choice for local or remote

Setup currently has two model choices: Models (Local or Claude, for scene checks and track picks) and the speech model (Whisper or Web Speech). Ideally one choice covers both: "Local" (Gemma for speech and scenes) or "Remote" (cloud speech-to-text plus Claude). Claude's API doesn't take audio, so "Remote" would pair Claude with a speech service: Web Speech's cloud mode (Google, no key) or a paid speech API. With Gemma staying out of speech-to-text (experiments/E11.md), "Local" means Whisper plus Gemma.

## 2. Music from incompetech as a second source

Kevin MacLeod's catalogue at incompetech.com: 1,443 tracks (87 hours, median 3 minutes) under CC BY 4.0, listed with title, mood ("feel"), genre and description in https://incompetech.com/music/royalty-free/pieces.json. Played straight from incompetech.com, as with Tabletop Audio: a direct MP3 link answers range requests and doesn't refuse other sites (checked 2026-10-11). Start with a hand-picked set that fills gaps, such as tavern fights. Notes:
- Each track's credit, in his form: "Title Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0", shown with the track and in About. Check each track's own page says CC BY before adding it.
- These are music, not ambience, and most are short and don't loop seamlessly, so playback needs to move on rather than loop one track.
- Linking to his files uses his bandwidth. Fine at our scale; write to him if traffic grows (see section 3), and host copies ourselves if he'd rather.

## 3. Usage analytics

Know roughly how many people use the app (and so how much traffic we send to incompetech and Tabletop Audio). A cookieless, privacy-friendly service that counts page views and sessions, never anything said at the table. About's Privacy section must say what is counted and by whom.

## 4. More labelled real play, for calm against tense

E13 replays Bardo's 9 episodes through the app (`//experiments/e13:replay`). Fights are good on real play, but calm play is mostly heard as tense, and town as tavern; tuning on 4 episodes didn't hold on the other 5, as calm and fights traded off (experiments/E13.md, round 2). More varied labelled play would show whether calm can improve without costing fights: label more transcripts the same way (other groups and styles; CRD3's Critical Role transcripts lack timestamps, but its "roll initiative" calls mark fights), and judge any change on fights first.

## 5. Gemini with the user's own API key (investigate)

A third engine beside Local and Claude: scene checks and track picks through the Gemini API, with a key the user brings, as Claude's are today (the same prompts, in the browser). Its draw is that a key is free from Google AI Studio, no card needed. Neither Google nor Anthropic lets a third-party app use a consumer subscription (Google AI Pro or Ultra, Claude Pro or Max) instead of a key (checked 2026-10-11). To find out:
- Free-tier limits per model against a session's load (a check every 15 seconds, about 720 in three hours, plus track picks). Reported figures for Gemini 2.5 Flash, about 10 a minute and 500 a day, would run out partway through a session; Flash-Lite allows more. Limits change often: read them from AI Studio.
- Privacy: on the free tier Google may use prompts and answers to improve its products, and the prompts are what's said at the table. Setup and About's privacy section must say so; the paid tier doesn't.
- Accuracy and speed against Claude and the local models, with the E13 replay (it would need the key in the replayed page).
- Whether item 1's "Remote" choice should then mean Claude or Gemini, or either.

## 6. Gemini Nano, built into Chrome (investigate)

Chrome's Prompt API runs Gemini Nano on the user's own device: free, private, no key, stable for ordinary web pages since Chrome 138, with JSON-schema answers (`responseConstraint`). If it judges scenes as well as Gemma 4 E2B, desktop users wouldn't need our 3.1 GB download (Chrome downloads and manages its own model). Limits (https://developer.chrome.com/docs/ai/prompt-api, 2026-10-11): desktop only (Windows, macOS, Linux, Chromebook Plus), not Android or iOS; 22 GB free disk, and 16 GB of RAM or more than 4 GB of video memory; the first download needs an unmetered connection. To find out:
- Accuracy against Gemma on the E13 replays (Bardo and CRD3), fights first; and speed per check. The replay's headless Chrome needs Nano enabled and downloaded.
- How it fits the blend with the embeddings, which Gemma's answers feed today (DESIGN.md 7.5): the Prompt API returns text, with no token probabilities in its documentation, so the blend would need a different input.
- Detection and fallback: use Nano where available, Gemma elsewhere (phones), or leave it as a choice.

## Smaller items

- Test the Web Speech options (on-device and cloud) in Chrome on the phone and the laptop.
- Phones: whether Gemma 4 E2B (3.1 GB) plus Whisper small fits and keeps up on Android; if not, a lighter default there (Whisper base, say).
- Test speech recognition with real table recordings rather than text-to-speech (E11 used text-to-speech).
- More art per intensity, especially tense (three images), and a few with known artists.
- Score Claude Haiku on the held-out set as a reference (needs an API key).
- Grow the held-out set from real session logs, especially fights starting and ending.
- Replay E13 on the Mac: Gemma's speed there against the RTX 5080, and confirm the memory-leak fix (the leak was in shared code, so long sessions on the Mac were likely affected too).
- Remaining design experiments: Cast from desktop Chrome (E1), Whisper model choice and microphones (E5, E6), a full session's browser behaviour (E10).

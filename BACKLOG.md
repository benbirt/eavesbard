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

## 4. More labelled real play, for tense against calm

E13 replays real play through the app: Bardo's 9 episodes and 10 of Critical Role's (CRD3), labelled by hand with the wiki's help (`//experiments/e13:replay`, three at a time). Fights are good. The danger question (round 3) fixed calm play heard as tense; the gap now is the reverse, tense play heard as calm (68% and 60% of tense checks right on the held-out half), mostly stealth and watching: sneaking, scouting, keeping watch at night. Rounds 4 and 5 found no fix in the prompt's wording, thresholds, more context, or other models (E13.md). More varied labelled play is what's left: other groups and styles, home tables especially, with plenty of quiet tense scenes, labelled the same way, tuned on one half and judged on the other, fights first.

## 5. Gemini with the user's own API key (investigate)

A third engine beside Local and Claude: scene checks and track picks through the Gemini API, with a key the user brings, as Claude's are today (the same prompts, in the browser). Its draw is that a key is free from Google AI Studio, no card needed. Neither Google nor Anthropic lets a third-party app use a consumer subscription (Google AI Pro or Ultra, Claude Pro or Max) instead of a key (checked 2026-10-11). To find out:
- Free-tier limits per model against a session's load (a check every 15 seconds, about 720 in three hours, plus track picks). Reported figures for Gemini 2.5 Flash, about 10 a minute and 500 a day, would run out partway through a session; Flash-Lite allows more. Limits change often: read them from AI Studio.
- Privacy: on the free tier Google may use prompts and answers to improve its products, and the prompts are what's said at the table. Setup and About's privacy section must say so; the paid tier doesn't.
- Accuracy and speed against Claude and the local models, with the E13 replay (it would need the key in the replayed page).
- Whether item 1's "Remote" choice should then mean Claude or Gemini, or either.

## 6. Gemini Nano, built into Chrome (tried: not good enough)

Tried in E13 round 4 (experiments/E13.md, "Other models"): it runs in Chrome 155 (headless too), answers in about 0.2 s, and Chrome manages its 4 GB download, but the Prompt API gives no probabilities, and with Gemma's prompts its danger answers were at chance and it called fights on half the checks of a scene with none (average 49% and 50% against Gemma's 73% and 66%). The client is in `experiments/e13/variants/nano.patch`. Worth another look if Chrome ships a stronger Nano, adds token probabilities, or prompts written for Nano do much better.

## Smaller items

- Test the Web Speech options (on-device and cloud) in Chrome on the phone and the laptop.
- Phones: whether Gemma 4 E2B (3.1 GB) plus Whisper small fits and keeps up on Android; if not, a lighter default there (Whisper base, say).
- Test speech recognition with real table recordings rather than text-to-speech (E11 used text-to-speech).
- More art per intensity, especially tense (three images), and a few with known artists.
- Score Claude Haiku on the held-out set as a reference (needs an API key).
- Grow the held-out set from real session logs, especially fights starting and ending.
- Replay E13 on the Mac: Gemma's speed there against the RTX 5080, and confirm the memory-leak fix (the leak was in shared code, so long sessions on the Mac were likely affected too). It also tests the files most users get: Chrome on Linux offers no 16-bit floats, so every E13 replay so far ran Gemma's `q4` files, not the `q4f16` ones Macs use.
- Remaining design experiments: Cast from desktop Chrome (E1), Whisper model choice and microphones (E5, E6), a full session's browser behaviour (E10).

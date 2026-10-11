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

## Smaller items

- Test the Web Speech options (on-device and cloud) in Chrome on the phone and the laptop.
- Phones: whether Gemma 4 E2B (3.1 GB) plus Whisper small fits and keeps up on Android; if not, a lighter default there (Whisper base, say).
- Test speech recognition with real table recordings rather than text-to-speech (E11 used text-to-speech).
- More art per intensity, especially tense (three images), and a few with known artists.
- Score Claude Haiku on the held-out set as a reference (needs an API key).
- Grow the held-out set from real session logs, especially fights starting and ending.
- Remaining design experiments: Cast from desktop Chrome (E1), Whisper model choice and microphones (E5, E6), a full session's browser behaviour (E10).

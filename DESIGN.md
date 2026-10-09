# Eavesbard — Design Doc

*Working title. Status: draft, pre-implementation.*

## 1. Summary

A static web app that listens to a tabletop RPG session, works out what kind of scene the party is in, and plays suitable ambient music and soundscapes without anyone touching it. Speech-to-text runs entirely in the browser. Only short transcript windows leave the machine, sent to a small, cheap language model that returns a scene label. Playback uses the Tabletop Audio ambience library, served from our own fork of a community GitHub mirror, and is output either to a Chromecast or to local speakers. At startup, the app resolves the fork's default branch to a commit and builds its track index in the browser from the metadata at that commit.

## 2. Goals

- Hands-off scene music: battle starts, tavern scenes, dungeon crawls and travel get appropriate audio automatically.
- Very low running cost: target pennies per four-hour session, and ideally zero once a local classifier is good enough.
- Pure static site, deployable to GitHub Pages, with no backend.
- Audio never leaves the browser; only text transcripts are sent to the model provider.
- Consistent content: within a session, the track index and the audio files always come from the same git commit of our fork. The fork itself acts as the pin, because its HEAD only moves when we deliberately sync it.
- No third-party data in our repo: only our code and our own configuration.
- Built-in instrumentation so classifier options can be compared offline against logged sessions.

## 3. Non-goals (for now)

- Manual DM overrides, including using overrides as correction labels for model evaluation. These come much later.
- Phone remotes or any multi-device control (this would need a relay backend).
- Syrinscape integration, including one-shot sound effects (this would need a CORS proxy).
- YouTube Music or Spotify playback.
- Tabletop Audio's Patreon-only alternate versions (separate music-only and ambience-only tracks).
- Browsers other than desktop Chrome or Chromium.

## 4. Constraints and assumptions

- **Host:** a laptop at the table running desktop Chrome. The Cast Web Sender SDK supports Chrome on desktop and Android, but not Chrome on iOS.
- **HTTPS:** the Cast SDK requires a secure origin. GitHub Pages provides HTTPS by default, and localhost is fine for development.
- **API key:** the user pastes their own Anthropic API key into the settings screen. It is stored in localStorage and never committed to the repo.
- **Direct browser calls:** the Anthropic API is called directly from the browser, which requires the `anthropic-dangerous-direct-browser-access: true` request header.
- **Licence:** Tabletop Audio's ten-minute ambiences are licensed CC BY-NC-ND 4.0. Our use is non-commercial and plays the files unmodified (fading volume during playback is not a derivative work). Attribution must be visible in the UI.

## 5. Architecture

The app is a single page made of the following stages, each a separate module with a narrow interface so that implementations can be swapped for experiments.

1. **Library loader** — at startup, resolves the fork's default branch to a commit SHA, fetches the track metadata at that SHA and builds the in-memory track index. The result is cached for offline fallback.
2. **Mic capture** — getUserMedia, mono, resampled to 16 kHz for Whisper.
3. **Speech-to-text** — Whisper via transformers.js on WebGPU, with WASM as a fallback. Audio is chunked on voice activity.
4. **Transcript buffer** — a rolling window of recent transcribed text with timestamps.
5. **Keyword trigger** — a cheap string matcher on each new transcript chunk, for instant combat detection.
6. **Classifier** — runs periodically on the transcript window and returns a scene label. The initial implementation is Claude Haiku over the API.
7. **Scene state machine** — applies hysteresis and dwell times so the music doesn't flap.
8. **Track selector** — maps the current scene to candidate tracks using the track index and picks one, avoiding recent repeats.
9. **Playback adapter** — either Cast (Default Media Receiver) or local Web Audio.
10. **Session logger** — records every classification cycle to IndexedDB, with JSONL export.
11. **UI** — start and stop controls, current scene and track, live transcript, settings, a running cost meter, library status, and attribution.

## 6. Scene labels

Scenes are described on two independent axes. Both are fixed enums, and the classifier must return values from them.

**Setting** (where the party is): `tavern`, `town`, `wilderness`, `dungeon`, `travel`, `unknown`.

**Intensity** (what's happening): `calm`, `tense`, `combat`.

The setting list is provisional. Finalise it after reviewing the actual tags in the mirror's YAML (see experiment E2). Add values only where the library has enough tracks to support them.

`unknown` means "keep doing what you're doing". It must never cause a track change.

## 7. Components in detail

### 7.1 Audio library and index

**Source and pinning**

- Fork `rsek/tabletop-audio-tracks` to our own account. A public fork protects us against upstream deletion or history rewrites.
- The fork's owner, repo name and branch live in app config.
- The fork itself is the pin: its HEAD only moves when we deliberately sync it from upstream, so the app picks up updates without a redeploy.
- No track data is committed to our repo or generated at build time.

**Startup sequence** (the library loader)

1. Resolve the fork's branch to a commit SHA via the GitHub REST API, e.g. `GET https://api.github.com/repos/<owner>/<repo>/commits/<branch>`, reading the `sha` field.
2. Fetch `https://raw.githubusercontent.com/<owner>/<repo>/<sha>/tabletop-audio-tracks.yaml`.
3. Parse it in the browser with js-yaml. The upstream repo includes a JSON schema in `schema/`, which can be used for validation.
4. Apply `config/tag-map.json` to build the in-memory index. Each entry holds:
   - the track id and title;
   - the original tags;
   - the derived setting and intensity buckets;
   - the full audio URL.
5. Build audio URLs from the same SHA: `https://raw.githubusercontent.com/<owner>/<repo>/<sha>/tracks/<file>.mp3`. Because every fetch in a session uses one SHA, the metadata and audio are always consistent.

**Mapping and reporting**

- **Tag mapping:** a hand-maintained `config/tag-map.json` maps upstream tags to our setting and intensity values. A track may sit in several buckets. Tracks with no usable tags are excluded.
- **Library status:** the UI shows the resolved SHA (short form) and the number of tracks in each setting and intensity bucket. It also shows how many tracks were excluded because their tags aren't in the map. A non-zero count is the cue to update `tag-map.json` after syncing the fork.

**Caching and failure handling**

- Cache the last successfully loaded SHA and parsed index in IndexedDB.
- If the GitHub API call fails or is rate-limited, start from the cache and show a non-blocking warning. Do the same if the YAML fetch or parse fails.
- If there is no cache and loading fails, show a clear error. Playback can't work without an index.

**Network notes**

- api.github.com and raw.githubusercontent.com both allow cross-origin requests, so no proxy is needed.
- Unauthenticated GitHub API calls are limited to 60 per hour per IP. We make one per page load.

**CI check**

- A scheduled or on-push GitHub Actions job resolves the fork's HEAD, fetches and parses the YAML, and fails if:
  - it no longer parses;
  - any setting and intensity bucket is empty;
  - the number of unmapped tags has grown.
- This replaces the validation a build-time index would have given us.

### 7.2 Speech-to-text

- transformers.js running a Whisper model on WebGPU. English-only models are fine to start with.
- **Voice activity detection:** start with a simple energy threshold. Upgrade to an in-browser VAD model if needed.
- **Chunking:** chunks of roughly 5 to 15 seconds, cut at pauses.
- **Output:** text chunks with start and end timestamps, appended to the transcript buffer.
- **Scope:** no speaker diarisation. We don't need to know who said what.
- **Model choice:** a trade-off of latency against accuracy (see experiment E5). Start with the smallest English model that keeps up in real time.

### 7.3 Transcript buffer

- Keeps the most recent two to three minutes of text. The size is configurable.
- Tracks whether there is new text since the last classification, so that calls are skipped during silence.

### 7.4 Keyword trigger

- Matches phrases like "roll initiative", "roll for initiative" and "initiative order", case-insensitive and tolerant of minor transcription noise.
- A match sets intensity to `combat` immediately, bypassing the classifier cadence and the dwell times.
- The phrase list lives in config. Leaving combat is handled by the classifier, never by keywords.

### 7.5 Classifier

- **Interface:** a function from a transcript window plus the current scene to a setting, an intensity and a confidence between 0 and 1. A short free-text reason is included in logs only.
- **Initial implementation:** the Anthropic Messages API, called directly from the browser.
  - The model is configurable. Default to the current Haiku model (at the time of writing, `claude-haiku-5-5`; check the docs for the current list).
  - Force structured output via tool use with a strict JSON schema whose enums match section 6.
  - The system prompt holds the label definitions and a few short examples. Mark it for prompt caching.
  - The user message holds the current scene plus the transcript window.
- **Cadence:** every 60 seconds by default (configurable), and only if there is new transcript text.
- **Prompt guidance:** the prompt should cover table talk that isn't in-game, such as rules lookups, snacks and real-world chat. In those cases the model should return `unknown` or the current scene.
- **Cost meter:** record input, output and cached token counts from each response's usage field. Show a running session total in the UI.
- **Failures:** on an API error or invalid JSON, log the failure and keep the current scene. Never crash playback.

### 7.6 Scene state machine

All parameters are configurable, and the defaults below are starting points to tune.

- **Entering combat:** immediate, on either a keyword match or a classifier result of `combat` with confidence of at least 0.6.
- **Leaving combat:** requires two consecutive non-combat classifications.
- **Setting changes:** require two consecutive classifications that agree on the new setting, and at least three minutes on the current setting.
- **Calm and tense changes:** require two consecutive agreeing classifications.
- **Low confidence:** results below 0.5 confidence are treated as `unknown`.
- **Implementation:** a pure function from the current state, a new event and the current time to a new state. It must be unit-testable without audio or network.

### 7.7 Track selector

- Picks a random track from the bucket matching the current setting and intensity, excluding the last few tracks played.
- **Empty buckets:** fall back first to the same intensity with any setting, then to the same setting with any intensity.
- **Track end:** when a track finishes (each is ten minutes long), pick another from the same bucket.
- **Scene change mid-track:** if the scene changes partway through a track, transition immediately.

### 7.8 Playback adapters

Both adapters implement one interface: play a track with a given fade duration, set volume, and notify when a track ends.

**CastAdapter**

- Uses the Google Cast Web Sender SDK (CAF) with the Default Media Receiver, so no receiver registration is needed.
- Load requests set `contentType: 'audio/mpeg'` explicitly, because raw.githubusercontent.com serves files as text/plain.
- **Transitions:** fade-and-swap. Ramp the receiver volume down, load the next track, then ramp back up to the user's chosen level. A true crossfade isn't possible with the Default Media Receiver.
- **Volume caveat:** this changes the device volume. Remember the user's level and always restore it, including on errors.
- The Cast session must be started by a user gesture on the Cast button, once per session.

**LocalAdapter**

- Uses two audio elements routed through Web Audio gain nodes, which allows true crossfades.
- Output goes to whatever the laptop is connected to: built-in speakers, Bluetooth or wired.

### 7.9 Session logger

Each classification cycle writes one record to IndexedDB containing:

- the timestamp;
- the transcript window sent;
- the model and request parameters;
- the raw response, the parsed result and the latency;
- the token usage;
- the scene state before and after;
- any keyword trigger hits since the last cycle;
- the track playing.

Two buttons export a session or all sessions as JSONL. These logs are the dataset for the classifier experiments in E9. Haiku's labels are treated as the reference, not as ground truth.

### 7.10 UI

- **Settings:** API key (localStorage), model, classifier cadence, state-machine parameters, output (Cast or local) and Whisper model. Advanced settings also allow overriding the library source (fork owner, repo and branch).
- **Main view:**
  - start and stop listening;
  - the Cast button;
  - the current scene and why it changed (keyword or classifier);
  - the current track title;
  - the live transcript;
  - the session cost.
- **Attribution footer:** "Ambiences by Tabletop Audio (tabletopaudio.com), CC BY-NC-ND 4.0", with links.
- **Privacy notice:** a short note that transcript snippets are sent to Anthropic, so the table knows.
- **Wake lock:** use the Screen Wake Lock API while listening.

## 8. Tech stack and repo layout

- TypeScript and Vite. Keep the framework minimal: vanilla TypeScript or Preact.
- Deploy to GitHub Pages via GitHub Actions. Set Vite's base path to the repo name.
- Vitest for unit tests, especially the state machine, track selector and tag mapping. The library loader should be tested against a fixture YAML file.
- A separate GitHub Actions workflow runs the library CI check described in 7.1.

Suggested layout:

```
/config            tag-map.json, keywords.json, defaults.json (incl. fork owner/repo/branch)
/src/library       SHA resolution, YAML fetch + parse, index build, IndexedDB cache
/src/audio         mic capture, VAD
/src/stt           Whisper (transformers.js) wrapper
/src/classify      classifier interface + anthropic.ts (later: webllm.ts, embeddings.ts)
/src/scene         state machine, track selector
/src/playback      adapter interface, cast.ts, local.ts
/src/log           IndexedDB logger, JSONL export
/src/ui            views and settings
/scripts           check-library.ts (used by the CI check)
/test/fixtures     synthetic YAML matching the upstream schema, for loader tests
/experiments       notes and results per experiment ID
```

The repo contains no third-party track data. The README should include a "Third-party content" section stating that the ambiences are by Tabletop Audio under CC BY-NC-ND 4.0, that the metadata comes from `rsek/tabletop-audio-tracks`, and that neither is covered by this repo's licence. The loader test fixture should use invented track entries that match the upstream schema, rather than copied upstream data.

## 9. Experiments and open risks

Each experiment gets a short write-up in `/experiments/<ID>.md` recording what was tried, the result and the decision.

**E1 — Casting raw GitHub URLs.**
- Cast one track from raw.githubusercontent.com at a resolved SHA, with `contentType: 'audio/mpeg'`.
- Confirm it plays despite the text/plain content type and nosniff header.
- Confirm that seeking and track-end events work.
- *Do this first: the whole hosting plan depends on it.*

**E2 — Git LFS and tag review.**
- Check whether any tracks are stored with Git LFS. LFS files return pointer files from raw URLs and would need media.githubusercontent.com instead.
- Review the YAML tags at the same time to finalise the setting list and draft `tag-map.json`.

**E3 — Hosting fallbacks.** Only needed if E1 or E2 fails.
- Try jsDelivr's GitHub endpoint, which is also pinnable by commit. It may have size limits that this repo exceeds.
- Otherwise, copy a curated subset into our own Pages repo (keeping well under the roughly 1 GB site size guideline) or into Cloudflare R2.

**E4 — GitHub rate limits and caching.**
- raw.githubusercontent.com: expected to be a non-issue at about one audio request every ten minutes, but confirm across a full-length session.
- api.github.com: one call per page load should sit well within the unauthenticated limit, but confirm.
- Check that the IndexedDB fallback works when the API call is blocked (simulate this in dev tools).
- Check that a newly synced fork HEAD is picked up on the next page load. SHA-addressed raw URLs are immutable, so CDN caching there shouldn't matter; only the API response's freshness does.

**E5 — In-browser Whisper.**
- Compare model sizes on WebGPU against WASM on the actual laptop.
- Measure real-time factor, end-to-end latency and transcript quality on real table audio: crosstalk, distance from the mic, background music bleeding in.
- Pick the default model.

**E6 — Microphone.** Compare the laptop's built-in mic with a USB conference or boundary mic at the centre of the table. Check whether music playing through local speakers degrades transcription.

**E7 — Transition feel.** Fade-and-swap over Cast versus true crossfade locally. Decide whether Cast transitions are acceptable, or whether a custom receiver is worth building later.

**E8 — Haiku baseline.**
- Run real sessions with the Haiku classifier.
- Measure cost per session, classification latency, and how often the scene changes.
- Judge subjectively whether changes feel right.
- Tune the prompt and state-machine parameters.
- This produces the logged dataset for E9.

**E9 — Local classifiers.** Replay logged transcript windows offline and measure agreement with Haiku's labels, per axis and overall, along with latency and one-off download size.
- **E9a — WebLLM:** small instruction models (around 1 to 3B parameters) with JSON-constrained output.
- **E9b — Embeddings:** a small sentence-embedding model via transformers.js, comparing the transcript window against embedded label descriptions. No generative model is involved.
- **E9c — Chrome's built-in Prompt API (Gemini Nano):** only if it is available to ordinary web pages at the time of testing.

**E10 — Browser behaviour over a full session.** Check:
- that the wake lock holds;
- the mic stays live;
- timers keep running;
- the Cast session survives four hours;
- memory use stays flat.

## 10. Milestones

- **M0 — Skeleton:** Vite and TypeScript app deployed to GitHub Pages via Actions, with the settings screen and the API key in localStorage.
- **M1 — Library and playback:**
  - the fork is created;
  - the library loader resolves the SHA, builds the index and caches it;
  - the library CI check is running;
  - a manual track picker plays through both adapters.
  
  Complete E1 to E4 here.
- **M2 — Listening:** mic capture, VAD and in-browser Whisper with a live transcript view. Complete E5 and E6 here.
- **M3 — Automation:**
  - the keyword trigger, Haiku classifier, state machine and track selector are wired end to end;
  - the cost meter is working.
- **M4 — Instrumentation:** the IndexedDB logger and JSONL export are in place. Run E8 over real sessions, and E10 alongside it.
- **M5 — Local classifier experiments:** E9, then decide whether the API key remains necessary.

## 11. Later and out of scope

- Manual DM overrides, and using them as correction labels in the evaluation set.
- Phone remote via a small relay, such as a Cloudflare Worker with WebSockets.
- Syrinscape one-shot sound effects triggered by keywords, via a CORS proxy.
- Patreon alternate versions, which would allow independent music and ambience channels: setting drives the ambience, and intensity drives the music.
- A custom Cast receiver for true crossfades on Cast devices.

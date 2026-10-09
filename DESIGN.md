# Eavesbard — Design Doc

*Working title. Status: draft, pre-implementation.*

## 1. Summary

A static web app that listens to a tabletop RPG session, works out what kind of scene the party is in, and plays suitable ambient music and soundscapes without anyone touching it. Speech-to-text runs entirely in the browser. Only short transcript windows leave the machine, sent to a small, cheap language model that returns a scene label. Playback uses the Tabletop Audio ambience library, streamed directly from Tabletop Audio's own audio host, and is output either to a Chromecast or to local speakers. Track metadata is scraped from tabletopaudio.com by a scheduled job into a generated index committed to this repo, and bundled into the app at build time.

## 2. Goals

- Hands-off scene music: battle starts, tavern scenes, dungeon crawls and travel get appropriate audio automatically.
- Very low running cost: target pennies per four-hour session, and ideally zero once a local classifier is good enough.
- Pure static site, deployable to GitHub Pages, with no backend.
- Audio never leaves the browser; only text transcripts are sent to the model provider.
- Consistent content: the track index is part of the build, so it only changes when we merge a regenerated index and redeploy.
- Metadata comes from the original source: titles, descriptions, genres and tags are generated from tabletopaudio.com, not maintained by hand.
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
- **Audio host:** tracks are served from `https://sounds.tabletopaudio.com/<file>.mp3` (S3 behind Cloudflare). Observed on 2026-10-09:
  - Requests with no `Origin` header succeed (206, `audio/mp3`, range requests supported), whatever the `Referer` or user agent.
  - Requests carrying any `Origin` other than `https://tabletopaudio.com` get 403 AccessDenied. CORS is only granted to tabletopaudio.com itself.
  - So the app must never request audio in CORS mode: no `fetch()`, and no `crossOrigin` attribute on audio elements. A plain `<audio src>` sends no `Origin` and works. Anything needing CORS-readable audio (Web Audio routing, preloading via fetch, checking files exist) is off the table.
- **Courtesy:** streaming from their host puts the bandwidth on Tabletop Audio. Usage is light (one ten-minute file per ten minutes per table), but we should tell them what we're doing, and move to self-hosting if they object.
- **Metadata source:** tabletopaudio.com's pages and data scripts send no CORS headers, so the browser can't read them. Metadata must be scraped outside the browser (see 7.1).

## 5. Architecture

The app is a single page made of the following stages, each a separate module with a narrow interface so that implementations can be swapped for experiments.

1. **Library loader** — at startup, applies the tag map to the bundled track index and builds the in-memory index.
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

The setting list is provisional. Finalise it after reviewing Tabletop Audio's own tag taxonomy (see 7.1 and experiment E2). Add values only where the library has enough tracks to support them.

`unknown` means "keep doing what you're doing". It must never cause a track change.

## 7. Components in detail

### 7.1 Audio library and index

**Sources**

- **Audio:** streamed directly from `https://sounds.tabletopaudio.com/<file>.mp3`, under the constraints in section 4. Nothing is mirrored.
- **Metadata:** scraped from tabletopaudio.com, which exposes everything we need without logging in:
  - the homepage HTML has one block per track, giving the numeric id (`song_318`), title, description, genre (as CSS classes such as `fantasy` or `scifi`), type (e.g. `ambience + music`) and the audio file stem (from the `saveAs('318_The_Gaping_Maw')` handler);
  - `bootstrap/js/tags_data.js` gives each track a curated four-facet tag set: `civ` (cities, interiors, ruins, temples, …), `biome` (forest, underground, swamp, …), `mood` (peaceful, tension, dramatic, epic, …) and `action` (explore, sneak, chase, skirmish, war, boss, …);
  - `bootstrap/js/dictionary_a.js` gives free-text search keywords per track (useful later for E9b).
- On 2026-10-09 the site listed 529 tracks. The community mirror `rsek/tabletop-audio-tracks` stopped at 313 in May 2022 and was maintained by hand, so we don't use it.

**Generated index**

- The generator, `scripts/build-index.ts`, scrapes the sources above and writes `data/tracks.json`. It contains no audio. The file is committed, so changes show up as reviewable diffs.
- A scheduled GitHub Actions job (weekly) runs the generator. If the output changes, it opens a pull request rather than pushing to the default branch, so the index only moves when we merge.
- The generator identifies itself with an honest user agent naming the project, and makes only a handful of requests per run.
- The generator fails, rather than opening a pull request, if:
  - the page structure no longer parses, or the numbers of tracks found in the HTML, `tags_data.js` and `dictionary_a.js` disagree by more than a small margin;
  - the track count drops sharply compared with the current `data/tracks.json`.
- The normal CI on that pull request (and on any change to `config/tag-map.json`) then fails if:
  - `data/tracks.json` doesn't match its schema;
  - any setting and intensity bucket would be empty after applying the tag map;
  - the number of tracks excluded as unmapped has grown.
- Because these checks run before a merge, a bad scrape or tag map never reaches the deployed app.

**`data/tracks.json` entry**

- `id` (Tabletop Audio's number), `title`, `description`, `genres`, `type`;
- `tags` with the four facets `civ`, `biome`, `mood` and `action`, plus `keywords`;
- `file`, the stem used to build the audio URL (`https://sounds.tabletopaudio.com/<file>.mp3`).

The file also records when it was generated. Filenames are kept exactly as the site gives them; they are not always derivable from the title (e.g. `4_Solemn_Vow-a`).

**Loading**

- `data/tracks.json` is imported by the app and bundled by Vite, so there is no runtime fetch, no GitHub API call and nothing to cache or fall back from.
- At startup, the library loader applies `config/tag-map.json` to build the in-memory index. Each entry holds:
  - the track id and title;
  - the original tags;
  - the derived setting and intensity buckets;
  - the full audio URL.
- The deploy pins the metadata only. Audio URLs point at Tabletop Audio's live files, which we can't pin; in practice they don't change once published.

**Mapping and reporting**

- **Tag mapping:** a hand-maintained `config/tag-map.json` maps Tabletop Audio's genres and tag facets to our setting and intensity values. Roughly: genre filters out sci-fi and modern tracks; `civ` and `biome` drive setting; `mood` and `action` drive intensity (e.g. mood `tension` or action `sneak` → `tense`; action `skirmish`, `war` or `boss` → `combat`). A track may sit in several buckets. Tracks with no usable tags are excluded.
- **Library status:** the UI shows when the index was generated, and the number of tracks in each setting and intensity bucket. It also shows how many tracks were excluded because their tags aren't in the map. Some exclusions are expected (non-fantasy genres).

**Failure handling**

- If an audio file fails to load (the element's `error` event), log it, mark the track as bad for the session and pick another. The browser can't check files in advance, because that would need a CORS request.
- Audio requests go to sounds.tabletopaudio.com without CORS, as described in section 4.

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
- Load requests set `contentType: 'audio/mpeg'` explicitly, because the audio host sends the non-standard `audio/mp3`.
- The receiver fetches the audio itself. If it sends an `Origin` header (for example because it plays MP3 through Media Source Extensions rather than a plain media element), the host will refuse it with 403. E1 checks this before anything else is built.
- **Transitions:** fade-and-swap. Ramp the receiver volume down, load the next track, then ramp back up to the user's chosen level. A true crossfade isn't possible with the Default Media Receiver.
- **Volume caveat:** this changes the device volume. Remember the user's level and always restore it, including on errors.
- The Cast session must be started by a user gesture on the Cast button, once per session.

**LocalAdapter**

- Uses two plain audio elements with no `crossOrigin` attribute, and crossfades by ramping each element's `volume` property in small steps.
- Web Audio gain nodes would give smoother ramps, but routing an element through Web Audio needs a CORS-mode request, which the audio host refuses (section 4).
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

- **Settings:** API key (localStorage), model, classifier cadence, state-machine parameters, output (Cast or local) and Whisper model.
- **Main view:**
  - start and stop listening;
  - the Cast button;
  - the current scene and why it changed (keyword or classifier);
  - the current track title;
  - the live transcript;
  - the session cost.
- **Attribution footer:** "Ambiences by Tabletop Audio (tabletopaudio.com), CC BY-NC-ND 4.0", with links. The current track's title, shown in the main view, completes the per-work attribution.
- **Privacy notice:** a short note that transcript snippets are sent to Anthropic, so the table knows.
- **Wake lock:** use the Screen Wake Lock API while listening.

## 8. Tech stack and repo layout

- TypeScript and Vite. Keep the framework minimal: vanilla TypeScript or Preact.
- Deploy to GitHub Pages via GitHub Actions. Set Vite's base path to the repo name.
- Vitest for unit tests, especially the state machine, track selector and tag mapping. The library loader should be tested against a fixture `tracks.json`, and the generator's parser against saved fixture pages.
- A scheduled GitHub Actions workflow runs the generator and opens pull requests (7.1).

Suggested layout:

```
/config            tag-map.json, keywords.json, defaults.json
/data              tracks.json (generated; do not edit by hand)
/src/library       tag mapping and index build
/src/audio         mic capture, VAD
/src/stt           Whisper (transformers.js) wrapper
/src/classify      classifier interface + anthropic.ts (later: webllm.ts, embeddings.ts)
/src/scene         state machine, track selector
/src/playback      adapter interface, cast.ts, local.ts
/src/log           IndexedDB logger, JSONL export
/src/ui            views and settings
/schema            tracks.schema.json (the index format the loader accepts)
/scripts           build-index.ts (the generator)
/test/fixtures     synthetic tracks.json and site pages, for loader and generator tests
/experiments       notes and results per experiment ID
```

The repo contains no audio, but `data/tracks.json` is third-party content: its titles, descriptions and tags are Tabletop Audio's. The README should include a "Third-party content" section stating that the ambiences are by Tabletop Audio under CC BY-NC-ND 4.0, that audio is streamed from Tabletop Audio's own servers, that `data/tracks.json` is generated from tabletopaudio.com, and that none of it is covered by this repo's MIT licence. The test fixtures should use invented track entries and pages rather than copied data.

## 9. Experiments and open risks

Each experiment gets a short write-up in `/experiments/<ID>.md` recording what was tried, the result and the decision.

**E1 — Playing from sounds.tabletopaudio.com.**
- Local: play a track from a plain `<audio>` element on the deployed GitHub Pages origin and on localhost. Confirm it plays, seeks and fires `ended`, and that the browser sends no `Origin` header (check in dev tools).
- Cast: load the same URL into the Default Media Receiver with `contentType: 'audio/mpeg'`. Confirm it plays, and that seeking and track-end events work. If the receiver gets a 403, find out whether it sends an `Origin` header.
- *Do this first: the whole hosting plan depends on it.*

**E2 — Scraper and tag review.**
- Write the generator and check its output against the site: track count, a sample of titles, descriptions and filenames, and every audio URL returning 206 to a non-CORS range request.
- Review Tabletop Audio's tag facets and genres to finalise the setting list and draft `tag-map.json`.

**E3 — Hosting fallbacks.** Only needed if E1 fails, or if Tabletop Audio asks us not to stream from their host.
- Mirror a curated subset of fantasy tracks ourselves: into a Pages repo (keeping well under the roughly 1 GB site size guideline) or into Cloudflare R2. Either way, the index's `file` field would point at our copy, and the generator would gain a download step.
- Mirroring the full library in a git repo is not an option: 529 tracks at around 14 MB each is well above GitHub's recommended repo size.

**E4 — Rate limits and the generator.**
- sounds.tabletopaudio.com: expected to be a non-issue at about one audio request every ten minutes, but confirm across a full-length session.
- Check that the generator works from GitHub Actions runners. Cloudflare may treat datacentre IP addresses differently from the requests tested so far.

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
  - the generator and its scheduled job are running, and `data/tracks.json` is committed;
  - the library loader builds the index from it;
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

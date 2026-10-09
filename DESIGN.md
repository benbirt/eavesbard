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
- **The host stays awake:** we assume nobody locks the laptop or closes its lid during a session. The app's job is to stop it locking, sleeping or starting its screensaver on its own (see the wake lock in 7.10).
- **HTTPS:** the Cast SDK requires a secure origin. GitHub Pages provides HTTPS by default, and localhost is fine for development.
- **API key:** the user pastes their own Anthropic API key into the settings screen. It is stored in localStorage and never committed to the repo.
- **Direct browser calls:** the Anthropic API is called directly from the browser through the official TypeScript SDK (`@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`, which sends the `anthropic-dangerous-direct-browser-access: true` header).
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
5. **Keyword trigger** — removed in favour of a faster classifier cadence (see 7.4).
6. **Classifier** — runs periodically on the transcript window and returns a scene label. The initial implementation is Claude Haiku over the API.
7. **Scene state machine** — applies hysteresis and dwell times so the music doesn't flap.
8. **Track selector** — maps the current scene to candidate tracks using the track index and picks one, avoiding recent repeats.
9. **Playback adapter** — either Cast (Default Media Receiver) or local Web Audio.
10. **Session logger** — records every classification cycle to IndexedDB, with JSONL export.
11. **UI** — start and stop controls, current scene and track, live transcript, settings, a running cost meter, library status, and attribution.

## 6. Scene labels

Scenes are described on two independent axes. Both are fixed enums, and the classifier must return values from them.

**Setting** (where the party is): `tavern`, `town`, `interior`, `wilderness`, `dungeon`, `travel`, `unknown`. `interior` covers indoor places that are neither taverns nor dungeons: castles, temples, courts, libraries.

**Intensity** (what's happening): `calm`, `tense`, `combat`.

The setting list is provisional. Against Tabletop Audio's tags (7.1), every setting and intensity combination has tracks, though tavern is thin when tense or in combat (one track each) and relies on the track selector's fallbacks. `interior` was added after the first tag review, when castles, temples and the like made up most of the unmapped tracks. Add values only where the library has enough tracks to support them.

`unknown` means "keep doing what you're doing". It must never cause a track change.

## 7. Components in detail

### 7.1 Audio library and index

**Sources**

- **Audio:** streamed directly from `https://sounds.tabletopaudio.com/<file>.mp3`, under the constraints in section 4. Nothing is mirrored.
- **Metadata:** scraped from tabletopaudio.com, which exposes everything we need without logging in:
  - the homepage HTML has one block per track, giving the numeric id (`song_318`), title, description, genre (as CSS classes such as `fantasy` or `scifi`), type (e.g. `ambience + music`) and the audio file stem (from the `saveAs('318_The_Gaping_Maw')` handler);
  - `bootstrap/js/tags_data.js` gives each track a curated four-facet tag set: `civ` (cities, interiors, ruins, temples, …), `biome` (forest, underground, swamp, …), `mood` (peaceful, tension, dramatic, epic, …) and `action` (explore, sneak, chase, skirmish, war, boss, …);
  - `bootstrap/js/dictionary_a.js` gives free-text search keywords per track (useful later for E9b).
- On 2026-10-09 the site listed 529 tracks, 528 of them downloadable. The community mirror `rsek/tabletop-audio-tracks` stopped at 313 in May 2022 and was maintained by hand, so we don't use it.
- **Quirks found on the site:**
  - The newest track can be a Patreon-only "sneak peek" with no download link. Tiles without a file are skipped.
  - Sixteen partner tiles (e.g. Starforged, Fragged Empire) show promotional text instead of a description; their description is left empty.
  - Descriptions end with notes such as "[3 Alternate versions available for Patreon Patrons]", which are stripped.
  - Genre classes include at least one typo (`scif`). The generator keeps the site's values as they are, and `tag-map.json` absorbs typos.
  - The two data scripts are plain JavaScript, not JSON (comments, unquoted keys, trailing commas, and DOM code after the object). The generator parses them with a JavaScript parser (acorn) and reads only the object literal, never running the script.

**Generated index**

- The generator, `scripts/build-index.ts`, scrapes the sources above and writes `data/tracks.json`. It contains no audio. The file is committed, so changes show up as reviewable diffs.
- A scheduled GitHub Actions job (weekly) runs the generator. If the output changes, it opens a pull request rather than pushing to the default branch, so the index only moves when we merge.
- The generator identifies itself with an honest user agent naming the project, and makes only a handful of requests per run.
- If nothing has changed, the generator leaves the file untouched, including its `generated` time, so unchanged weeks produce no pull request.
- The generator fails, rather than writing the file, if:
  - the page yields fewer than 100 tracks (the page structure has probably changed);
  - more than 5% of tracks have no entry in `tags_data.js` (`dictionary_a.js` is optional per track);
  - the track count falls by more than 10% compared with the current `data/tracks.json`;
  - two tracks share a file.
- Pull requests opened with the workflow's own token don't trigger other workflows, so the update workflow runs the full test suite itself before opening the pull request.
- The test suite (in that workflow, and in CI on any change to `config/tag-map.json`) fails if:
  - `data/tracks.json` doesn't match its format (checked by `parseTracksFile` in `src/library/tracks-file.ts`, which the app also uses);
  - any setting and intensity bucket would be empty after applying the tag map;
  - the number of tracks excluded as unmapped has grown (see the checks on the map below).
- Because these checks run before a merge, a bad scrape or tag map never reaches the deployed app.

**`data/tracks.json` entry**

- `id` (Tabletop Audio's number), `title`, `description`, `genres` (the site's genre filters, such as `fantasy` or `scifi`), `hasMusic` (whether the site files it under its "music" filter) and `type` (e.g. `ambience + minimal music`);
- `tags` with the four facets `civ`, `biome`, `mood` and `action`, plus `keywords`;
- `file`, the stem used to build the audio URL (`https://sounds.tabletopaudio.com/<file>.mp3`).

The file also records when it was generated. Filenames are kept exactly as the site gives them; they are not always derivable from the title (e.g. `4_Solemn_Vow-a`).

**Loading**

- `data/tracks.json` is imported by the app and bundled by esbuild, so there is no runtime fetch, no GitHub API call and nothing to cache or fall back from.
- At startup, the library loader applies `config/tag-map.json` to build the in-memory index. Each entry holds:
  - the track id and title;
  - the original tags;
  - the derived setting and intensity buckets;
  - the full audio URL.
- The deploy pins the metadata only. Audio URLs point at Tabletop Audio's live files, which we can't pin; in practice they don't change once published.

**Mapping and reporting**

- **Tag mapping:** a hand-maintained `config/tag-map.json` maps Tabletop Audio's metadata onto our setting and intensity values:
  - **Scope:** a track is in scope if it has an included genre (`fantasy`, `historical`, `horror`, `nature`) and no excluded one (`scifi`, `scif`, `modern`). `includeTracks` and `excludeTracks` override this for individual track ids; for example, two jazz-age tracks filed as historical (1920s Speakeasy, Cotton Club) are excluded.
  - **Interior:** the `interior` rule uses the site's `temples` tag and words such as castle, throne and library, but not its broad `interiors` tag, which also covers every tavern and many dungeon rooms.
  - **Buckets:** each setting and intensity has a rule listing tag values per facet (`civ`, `biome`, `mood`, `action`) and `words`. A track is in a bucket if it has any listed tag, or any listed word appears as a whole word in its title or keywords. A track may sit in several buckets.
  - **Unmapped:** in-scope tracks with no setting or no intensity are left out. `maxUnmapped` records how many that currently is.
  - As of 2026-10-09, 356 of 528 tracks are in scope, 332 are mapped and 24 are unmapped.
  - The library builder (`buildLibrary` in `src/library/tag-map.ts`) is shared by the app and the tests.
- **Checks on the map:** the test suite fails if any setting and intensity bucket is empty, if the number of unmapped tracks exceeds `maxUnmapped`, or if the map names a tag, genre or track id that doesn't exist in the data (catching typos). So a weekly index update that brings in unmapped tracks fails its tests and opens no pull request until the map is updated.
- **Tuning:** `bazel run //scripts:library_report` prints the bucket sizes and the unmapped tracks; `bazel run //scripts:library_report -- town/tense` lists one bucket.
- **Library status:** the UI shows when the index was generated, and the number of tracks in each setting and intensity bucket. It also shows how many tracks were excluded because their tags aren't in the map. Some exclusions are expected (non-fantasy genres).

**Failure handling**

- If an audio file fails to load (the element's `error` event), log it, mark the track as bad for the session and pick another. The browser can't check files in advance, because that would need a CORS request.
- Audio requests go to sounds.tabletopaudio.com without CORS, as described in section 4.

### 7.2 Speech-to-text

- transformers.js running a Whisper model on WebGPU, in a Web Worker (`src/stt/worker.ts`) so inference never blocks the page. English-only models are fine to start with.
- **Capture:** `getUserMedia` into an `AudioContext` running at 16 kHz (Chrome resamples), with an AudioWorklet (`src/audio/capture-worklet.ts`) posting 512-sample (32 ms) frames to the worker.
- **Models:** Whisper `tiny.en`, `base.en` or `small.en` from `onnx-community`, with a full-precision encoder and 4-bit decoder (one-off downloads of about 120, 205 and 590 MB; cached by the browser afterwards). The default is `base.en` until E5 decides. The page shows a progress bar while models download, then a "preparing" stage while WebGPU compiles shaders on a warm-up run.
- **ONNX Runtime:** its WebAssembly build (27 MB) is served from our own site (`ort/`), not from transformers.js's default CDN.
- **WebGPU only:** no WASM fallback. Multithreaded WASM needs COOP/COEP headers, which GitHub Pages can't set, and the service-worker workaround would force CORS onto audio requests, which the audio host refuses (section 4). If WebGPU isn't available, the app says so and doesn't listen.
- **Voice activity detection:** an in-browser VAD model (Silero, `onnx-community/silero-vad`, run through transformers.js so there's one ONNX Runtime) from the start. An energy threshold would trigger constantly once ambience is playing in the room.
- **Segmenting:** `src/stt/segmenter.ts` turns per-frame speech probabilities into segments: speech starts at probability 0.5 and continues while above 0.35; 600 ms of silence ends a segment; segments under 250 ms of speech are dropped; segments are cut at 15 s; 300 ms of audio before speech is kept so first words aren't clipped. All are starting points for E5.
- **Hallucination filter:** Whisper invents text from noise and music ("Thanks for watching", repeated phrases). `src/stt/hallucination.ts` drops segments that are empty, only annotations such as "[Music]", known hallucination phrases, or mostly one phrase repeated, so they never reach the transcript buffer. The page can show dropped lines, struck through, for tuning.
- **Mic settings:** the `getUserMedia` choices for echo cancellation, noise suppression and automatic gain are settled in E6. Chrome's echo cancellation can help with local playback but does nothing for audio played through Cast.
- **Output:** text chunks with start and end timestamps, appended to the transcript buffer.
- **Scope:** no speaker diarisation. We don't need to know who said what.
- **Model choice:** a trade-off of latency against accuracy (see experiment E5). Start with the smallest English model that keeps up in real time.
- **Visible tab:** for now the app requires its tab to stay visible while listening, because Chrome throttles timers in hidden tabs. E10 checks whether that is enough.

### 7.3 Transcript buffer

- Keeps the most recent two to three minutes of text. The size is configurable.
- Tracks whether there is new text since the last classification, so that calls are skipped during silence.

### 7.4 Keyword trigger

**Removed.** A phrase matcher ("roll initiative" → combat at once) was built in M3 and then dropped in favour of keeping every decision with the classifier:

- Its only advantage was speed: with a 60-second classifier cadence, combat could start up to a minute late. Running the classifier every 30 seconds closes most of that gap.
- It couldn't tell a fight from rules talk ("how does initiative work again?"), and the minimum combat time then made a false alarm stick.
- If E8 shows combat still starts too late, the next step is an on-demand classification when a combat phrase is heard, with the classifier still deciding, rather than a keyword that switches by itself.

### 7.5 Classifier

- **Interface:** a function from a transcript window, the current scene and how long it has lasted to a setting and an intensity, each with its own confidence between 0 and 1. A short free-text reason is included in logs only.
- **Initial implementation:** the Anthropic Messages API via the TypeScript SDK, called directly from the browser (`src/classify/classifier.ts`).
  - The model is `claude-haiku-5-5`.
  - Structured outputs (`output_config.format` with a JSON schema whose enums come from section 6) rather than a forced tool call, which is the recommended way to get classification JSON from current models. The answer is still parsed and checked.
  - Effort `low` with the model's default adaptive thinking, and `max_tokens` 1024 to leave room for thinking before the short answer. Content blocks are read by type, since a response can start with a thinking block.
  - The system prompt (`src/classify/prompt.ts`) holds the label definitions, the table-talk rules and a few short examples, and is marked for prompt caching. Haiku 5.5 caches prompts of 512 tokens or more; the prompt is well over that, and a test keeps it so.
  - The user message holds the current scene, how long it has lasted, and the transcript window.
- **Cadence:** every 30 seconds, and only if there is new transcript text. Each call sends the last two and a half minutes of transcript text (not audio), with each line marked by how long ago it was said; the prompt says the most recent lines matter most. The overlap between calls is deliberate: the setting often depends on something said a few minutes earlier.
- **Prompt guidance:** the prompt should cover table talk that isn't in-game, such as rules lookups, snacks and real-world chat. In those cases the model should return `unknown` or the current scene.
- **Cost meter:** record input, output and cached token counts from each response's usage field. Prices per model come from `config/pricing.json`, updated by hand (Haiku 5.5: $0.10 input, $0.50 output, $0.01 cache reads and $0.125 cache writes per million tokens, for prompts of 100K tokens or fewer). Show a running session total in the UI, with the share of input served from cache.
- **Rough cost:** each call is about 1,000 tokens of input (mostly the cached system prompt) and a few hundred of output including thinking, so roughly $0.0001 to $0.0003. A four-hour session makes at most 480 calls: roughly 5 to 15 cents.
- **Failures:** on an API error or invalid JSON, log the failure and keep the current scene. Never crash playback.

### 7.6 Scene state machine

All parameters are configurable, and the defaults below are starting points to tune.

- **Starting scene:** a configurable default (`tavern`, `calm`), which plays from the moment listening starts.
- **Entering combat:** immediate, on a classifier result of `combat` with intensity confidence of at least 0.6.
- **Leaving combat:** requires two consecutive non-combat classifications, and at least three minutes in combat, so a lull between rounds doesn't drop the combat music.
- **Setting changes:** require two consecutive classifications that agree on the new setting, and at least three minutes on the current setting.
- **Calm and tense changes:** require two consecutive agreeing classifications.
- **Low confidence:** each axis is judged on its own confidence. A setting below 0.5 is treated as `unknown`; an intensity below 0.5 is ignored, keeping the current one.
- **`unknown` and streaks:** an `unknown` result neither counts towards nor resets a streak of agreeing classifications.
- **Simultaneous changes:** if setting and intensity both change in the same cycle, that is one transition, not two.
- **Implementation:** a pure function from the current state, a new event and the current time to a new state (`src/scene/state-machine.ts`), unit-tested without audio or network.
- **Orchestration:** `src/director.ts` runs while listening with automatic music on: transcript lines feed the buffer; every 30 seconds, if there's new text and an API key, the classifier runs; scene changes go through the state machine to the track selector and the player.

### 7.7 Track selector

- Picks a random track from the bucket matching the current setting and intensity, excluding the last few tracks played. In a bucket with too few tracks for that, it excludes only the track just played.
- **Empty buckets:** fall back first to the same intensity with any setting, then to the same setting with any intensity.
- **Recent repeats:** the last five tracks are avoided; in a bucket of five or fewer, only the track just played.
- **Track end:** when a track finishes (each is ten minutes long), pick another from the same bucket.
- **Scene change mid-track:** if the scene changes partway through a track, transition immediately.
  - **Intensity changes always switch track**, preferring tracks not also tagged with the intensity being left, so calm to combat sounds different: first from the scene's bucket, then from the same intensity in any setting, and only then any track in the bucket. (A test showed a track tagged both `celebrate` and `skirmish` carrying on into combat; it's also the only tavern combat track, so a tavern fight now borrows combat music from another setting.)
  - **Setting-only changes** keep the current track if it's also in the new bucket.

### 7.8 Playback adapters

Both adapters implement one interface: play a track with a given fade duration, set volume, and notify when a track ends.

**CastAdapter**

- Uses the Google Cast Web Sender SDK (CAF) with the Default Media Receiver, so no receiver registration is needed.
- Load requests set `contentType: 'audio/mpeg'` explicitly, because the audio host sends the non-standard `audio/mp3`.
- The receiver fetches the audio itself. If it sends an `Origin` header (for example because it plays MP3 through Media Source Extensions rather than a plain media element), the host will refuse it with 403. E1 checks this before anything else is built.
- **Transitions:** fade-and-swap. Ramp the receiver volume down, load the next track, then ramp back up to the user's chosen level. A true crossfade isn't possible with the Default Media Receiver.
- **Volume caveat:** this changes the device volume. Remember the user's level and always restore it, including on errors.
- The Cast session must be started by a user gesture on the Cast button, once per session.
- **Discovery needs operating system permissions** that web pages can't see: on Android, Chrome's Nearby devices permission; on recent macOS, Local Network access for Chrome. Without them the SDK simply finds no devices and the Cast icon never appears (seen in E1). When no devices are found after a few seconds, the page says what to check for the current platform.
- **Lost sessions:** if the Cast session ends unexpectedly (for example the receiver times out), show a clear warning and ask the user to reconnect. Reconnecting needs a user gesture, so it can't be automatic.

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
- the track playing.

Scene changes and track starts and ends are logged as events of their own, so a replay keeps their order.

Two buttons export a session or all sessions as JSONL, and a third clears all stored logs. These logs are the dataset for the classifier experiments in E9. Haiku's labels are treated as the reference, not as ground truth.

### 7.10 UI

- **Settings:** API key (localStorage), model, classifier cadence, state-machine parameters, output (Cast or local) and Whisper model.
- **Main view:**
  - start and stop listening;
  - the Cast button;
  - the current scene and why it changed;
  - the current track title;
  - the live transcript;
  - the session cost.
- **Attribution footer:** "Ambiences by Tabletop Audio (tabletopaudio.com), CC BY-NC-ND 4.0", with links. The current track's title, shown in the main view, completes the per-work attribution.
- **Privacy notice:** a short note, so the table knows, that transcript snippets are sent to Anthropic and that transcripts are stored in this browser until cleared and can be exported.
- **API key risk:** any script running on the page could read the key from localStorage. To keep that surface small, all dependencies are bundled and ONNX Runtime is self-hosted; the only third-party script loaded at runtime is the Google Cast SDK, which Google requires to be loaded from gstatic.com. Model weights are data downloaded from Hugging Face, not code.
- **Wake lock:** hold a Screen Wake Lock (`navigator.wakeLock.request("screen")`) while listening. In Chrome this stops the display sleeping and the screensaver starting, and with them the operating system's automatic lock (on macOS, auto-lock follows the screensaver or display sleep).
  - Chrome releases the lock whenever the tab is hidden (another tab selected, window minimised). Re-request it on `visibilitychange` when the page becomes visible again.
  - Show the lock's state in the main view, with a clear warning while listening without it, so whoever is running the game notices and brings the tab back.
  - The request can fail (for example in low-power modes). Treat that the same way: warn, and carry on listening.

## 8. Tech stack and repo layout

- **Build:** Bazel (version pinned in `.bazelversion`, run via Bazelisk) with Bzlmod and the standard JavaScript rule sets from the Bazel Central Registry:
  - `rules_nodejs` for the Node toolchain;
  - `aspect_rules_js` for npm packages (from `pnpm-lock.yaml`) and for running Node programs and tests;
  - `aspect_rules_ts` for type-checking and compiling TypeScript (`ts_project`);
  - `aspect_rules_esbuild` for bundling;
  - `bazel_lib` (`copy_to_directory`) for assembling the static site.
- **Language:** TypeScript in strict mode.
- **UI:** Preact with Preact Signals. JSX is compiled by TypeScript (`jsxImportSource: preact`), so no extra build tooling is needed. State that changes outside the UI (playback, Cast, and later the audio worker and classifier) lives in signals in plain modules such as `src/player.ts`; components in `src/ui/` read them and stay thin.
- **Packages:** pnpm. No dependency may run install scripts (`allowBuilds` in `pnpm-workspace.yaml`). `pnpm-workspace.yaml` also removes transformers.js's Node-only dependencies (`onnxruntime-node`, about 300 MB, and `sharp`), and declares `onnxruntime-common`, which transformers.js imports without listing.
- **Cache busting:** the build adds a hash of all the page's scripts to the bundle URL (`main.js?v=<hash>`), and the page passes the same query to its worker and worklet, so a browser never mixes cached old scripts with a new page.
- **Tests:** Node's built-in test runner (`node:test`), each test file run as a Bazel `js_test`. Priorities are the state machine, track selector and tag mapping. The library loader should be tested against a fixture `tracks.json`, and the generator's parser against saved fixture pages.
- **Targets:** `bazel test //...` type-checks, builds and tests everything; `//src:site` is the deployable site; `bazel run //tools:serve` serves it on localhost.
- **CI and deployment:** one GitHub Actions workflow runs the tests on every push and pull request, and deploys `//src:site` to GitHub Pages from `main`. All asset paths are relative, so the site works under the `/eavesbard/` path without configuration.
- A scheduled GitHub Actions workflow runs the generator and opens pull requests (7.1).

Suggested layout:

```
/config            tag-map.json, pricing.json
/data              tracks.json (generated; do not edit by hand)
/src               app entry point (app.tsx), index.html, settings, player.ts (playback state and actions)
/src/library       index format and validation, tag mapping and index build
/src/audio         mic capture, VAD
/src/stt           Whisper (transformers.js) wrapper
/src/classify      classifier (Anthropic SDK), prompt, cost (later: webllm.ts, embeddings.ts)
/src/scene         transcript buffer, state machine, track selector
/src/director.ts   automatic music: wires listening, classifier, scene and player together
/src/playback      adapter interface, cast.ts, local.ts
/src/log           IndexedDB logger, JSONL export
/src/ui            Preact components
/scripts           build-index.ts (the generator) and its parsing code
/tools             dev server, shared Bazel macros
/experiments       notes and results per experiment ID
```

The repo contains no audio, but `data/tracks.json` is third-party content: its titles, descriptions and tags are Tabletop Audio's. The README should include a "Third-party content" section stating that the ambiences are by Tabletop Audio under CC BY-NC-ND 4.0, that audio is streamed from Tabletop Audio's own servers, that `data/tracks.json` is generated from tabletopaudio.com, and that none of it is covered by this repo's MIT licence. Tests sit next to the code they test (`*.test.ts`), and their fixtures use invented track entries and pages rather than copied data.

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
- Compare model sizes on WebGPU on the actual laptop.
- Measure real-time factor, end-to-end latency and transcript quality on real table audio: crosstalk, distance from the mic, background music bleeding in.
- Pick the default model.

**E6 — Microphone.** Compare the laptop's built-in mic with a USB conference or boundary mic at the centre of the table. Check whether music playing through local speakers degrades transcription.

**E7 — Transition feel.** Fade-and-swap over Cast versus crossfade locally. For Cast, check whether the media stream's own volume can be faded instead of the device volume, which would avoid fighting the speaker's own volume controls. Decide whether Cast transitions are acceptable, or whether a custom receiver is worth building later.

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

**E10 — Browser behaviour over a full session.** On a Mac with default power and lock settings, left untouched, check:
- that the wake lock holds, and the display, screensaver and auto-lock never kick in, with both local and Cast output;
- that the wake lock is re-acquired after switching tabs and back;
- the mic stays live;
- timers keep running;
- the Cast session survives four hours;
- memory use stays flat.

## 10. Milestones

- **M0 — Skeleton:** Bazel-built TypeScript app deployed to GitHub Pages via Actions, with the settings screen, the API key in localStorage, and a manual playback test page for E1.
- **M1 — Library and playback:**
  - the generator and its scheduled job are running, and `data/tracks.json` is committed;
  - the library loader builds the index from it;
  - a manual track picker plays through both adapters.
  
  Complete E1 to E4 here.
- **M2 — Listening:** mic capture, VAD and in-browser Whisper with a live transcript view. Complete E5 and E6 here.
- **M3 — Automation:**
  - the Haiku classifier, state machine and track selector are wired end to end;
  - the cost meter is working.
- **M4 — Instrumentation:** the IndexedDB logger and JSONL export are in place. Run E8 over real sessions, and E10 alongside it.
- **M5 — Local classifier experiments:** E9, then decide whether the API key remains necessary.

## 11. Later and out of scope

- Manual DM overrides, and using them as correction labels in the evaluation set.
- Phone remote via a small relay, such as a Cloudflare Worker with WebSockets.
- Syrinscape one-shot sound effects triggered by keywords, via a CORS proxy.
- Patreon alternate versions, which would allow independent music and ambience channels: setting drives the ambience, and intensity drives the music.
- A custom Cast receiver for true crossfades on Cast devices.

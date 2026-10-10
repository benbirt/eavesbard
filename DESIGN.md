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
5. **Keyword trigger** — removed; the classifier runs often instead (see 7.4).
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
- **Web Speech alternative** (`src/stt/web-speech.ts`): the speech-model menu also offers the browser's own Web Speech API, in two modes. *Cloud* is the API's default; Chrome sends the audio to Google's servers, so the page warns that the table should know. *On-device* sets `processLocally` and, if needed, asks the browser to install its English language pack first (`SpeechRecognition.available()` / `install()`). Both are built for Chrome; the page warns that other browsers may not work. Recognition restarts itself whenever the browser ends it after a silence, and gives up if it keeps ending straight away. There's no download from us and no hallucination filter (Web Speech doesn't invent text from music the way Whisper does). Whisper stays the default: it works the same everywhere WebGPU does, and its segmenting is under our control. Web Speech is there to compare on real devices.
- **Visible tab:** for now the app requires its tab to stay visible while listening, because Chrome throttles timers in hidden tabs. E10 checks whether that is enough.

### 7.3 Transcript buffer

- Keeps the most recent two to three minutes of text. The size is configurable.
- Tracks whether there is new text since the last classification, so that calls are skipped during silence.

### 7.4 Keyword triggers (removed)

Keywords that switched the scene or forced an immediate check were tried and dropped: they couldn't tell a fight from rules talk, and with a check every 15 seconds they saved little time.

### 7.5 Classifier

- **Interface:** a function from a transcript window, the current scene and how long it has lasted to a setting and an intensity, each with its own confidence between 0 and 1. A short free-text reason is included in logs only.
- **Cadence:** every 15 seconds, and only if there is new transcript text. The overlap between checks is deliberate: the setting often depends on something said a few minutes earlier.
- **Which engine decides** (Setup → Models): Local (the default) or Claude, for both scene checks and track picks. Without an API key, Claude falls back to Local and the timeline says so. By default the other engine also runs on the same input (Claude only with a key) and its answers are recorded as comparisons that change nothing. The local models start downloading when the page opens if they will be needed.
- **Failures:** on any model error or invalid answer, log the failure and keep the current scene. Never crash playback.

**Local** (`src/local-models.ts`, `src/classify/local-classifier.ts`, `src/classify/llm-prompt.ts`, `src/llm/`): Gemma 4 E2B on WebGPU, blended with a small embedding model. No key, no cost. On the held-out test set this gets 83% of scenes fully right, against 64% for the embeddings alone; experiments/E9.md has the comparisons that led here.
- **Gemma 4 E2B** (`onnx-community/gemma-4-E2B-it-ONNX`, text only): a one-off download of about 3.1 GB (4-bit weights, 16-bit activations), or 3.6 GB on GPUs without 16-bit floats, cached by the browser afterwards. It runs in its own worker and answers in 0.5–0.9 s on an Apple M5.
  - Each check asks two questions: where the characters are, and how intense the scene is. Each gives the transcript (the last 150 or 60 words), the current scene with "keep that answer unless the transcript shows it has changed", and the labels with one-line meanings.
  - **During a fight** it's also asked "is the fight still going on?" (ongoing or over). Above 50% over, the intensity becomes the calmer of the blended non-combat answers, with that confidence, which ends the fight on one result once it has lasted a minute (7.6).
  - Nothing is generated: the answer is prefilled up to the label ("Answer:"), and one forward pass gives each label's probability, adding spellings such as " dungeon" and " Dungeon".
  - Invalid numbers (NaN, as Gemma 3 gave on Apple GPUs) are an error, not a tie.
- **Embeddings** (`Xenova/bge-small-en-v1.5`, about 34 MB, also used to pick tracks, 7.7): the transcript is compared with short, table-talk-like descriptions of each setting and intensity, plus an "off-topic" group (rules lookups, food, scheduling); each label scores its best-matching description, and a softmax gives the confidence. The setting is judged from the last 150 words, the intensity from the last two lines (at most 30 words). They make fights starting and off-topic chat reliable, where Gemma alone is weak.
- **Blend:** setting probabilities half and half, intensity 75% embeddings and 25% Gemma, after softening Gemma's near-certain answers (raised to the power 1/3 and renormalised). An off-topic win keeps the current intensity. These values were chosen with Gemma 3 and are due a re-tune (BACKLOG.md).
- **Fallback:** the embeddings decide alone while Gemma downloads, if it fails to load or answer, or in a browser without WebGPU (then setting cutoffs apply: similarities below 0.54 mean unknown). The page and timeline say so, and the timeline names the models behind each answer.

**Claude** (`src/classify/classifier.ts`): the Anthropic Messages API via the TypeScript SDK, called directly from the browser.
- The model is `claude-haiku-5-5`, with structured outputs (`output_config.format` with a JSON schema whose enums come from section 6). The answer is still parsed and checked.
- Effort `low` with the model's default adaptive thinking, and `max_tokens` 1024 to leave room for thinking before the short answer. Content blocks are read by type, since a response can start with a thinking block.
- The system prompt (`src/classify/prompt.ts`) holds the label definitions, the table-talk rules and a few short examples, and is marked for prompt caching. Haiku 5.5 caches prompts of 512 tokens or more; the prompt is well over that, and a test keeps it so.
- The user message holds the current scene, how long it has lasted, and the last two and a half minutes of transcript, with each line marked by how long ago it was said. The prompt says the most recent lines decide, so a fight that has just ended counts as over however much combat came before, and table talk that isn't in-game returns `unknown` or the current scene.
- **Cost meter:** input, output and cached token counts from each response, priced from `config/pricing.json` (Haiku 5.5: $0.10 input, $0.50 output, $0.01 cache reads and $0.125 cache writes per million tokens). The UI shows a running session total and the share of input served from cache. Each call costs roughly $0.0001 to $0.0003, so a four-hour session costs roughly 10 to 30 cents.
- `ANTHROPIC_API_KEY=... bazel run //scripts:classifier_check` runs the scripted scenes through the same code and prompt, and reports where Haiku differs from what's expected. Under a cent per run.

**Evaluation:** `src/eval/scenarios.ts` (a small development set used for tuning, including real session moments) and `src/eval/test-set.ts` (108 held-out scenes). `//src:eval_site` with `experiments/e9/browser-eval.mjs` runs both through the app's own models on a local GPU, and `experiments/e9/analyse.mjs` scores them. See experiments/E9.md.

### 7.6 Scene state machine

All parameters are configurable, and the defaults below are starting points to tune.

- **Starting scene:** the person starting the session can type a few words describing the opening scene ("underground, exploring"). The classifier turns that into the starting setting and intensity, and the first track plays at once, before the speech model has even loaded. Without a description, an API key, or a usable answer, a default (`tavern`, `calm`) is used, and the timeline says why. The description is remembered for next time.
- **Entering combat:** immediate, on a classifier result of `combat` with intensity confidence of at least 0.6.
- **Leaving combat:** at least one minute in combat, so a lull between rounds doesn't drop the combat music; then either one non-combat classification with intensity confidence of at least 0.8, or two consecutive non-combat classifications. (Was three minutes and always two results: a simulation showed combat music outlasting a short fight by over two minutes even when the classifier saw at once that it had ended.)
- **Setting changes:** require two consecutive classifications that agree on the new setting, and at least three minutes on the current setting.
- **Calm and tense changes:** require two consecutive agreeing classifications.
- **Low confidence:** each axis is judged on its own confidence. A setting below 0.5 is treated as `unknown`; an intensity below 0.5 is ignored, keeping the current one.
- **`unknown` and streaks:** an `unknown` result neither counts towards nor resets a streak of agreeing classifications.
- **Simultaneous changes:** if setting and intensity both change in the same cycle, that is one transition, not two.
- **Implementation:** a pure function from the current state, a new event and the current time to a new state (`src/scene/state-machine.ts`), unit-tested without audio or network.
- **Orchestration:** `src/director.ts` runs while listening with automatic music on: transcript lines feed the buffer; every 15 seconds, if there's new text and an API key, the classifier runs; scene changes go through the state machine to the track selector and the player.

### 7.7 Track selector

**Which tracks are allowed** (`src/scene/selector.ts`):

- The bucket matching the current setting and intensity. **Empty buckets** fall back first to the same intensity with any setting, then to the same setting with any intensity.
- **Recent repeats:** the last five tracks are avoided; in a pool of five or fewer, only the track just played.
- **Intensity changes always switch track**, preferring tracks not also tagged with the intensity being left, so calm to combat sounds different: first from the scene's bucket, then from the same intensity in any setting, and only then any track in the bucket.
- **Setting-only changes** keep the current track if it's also in the new bucket.
- **Track end:** when a track finishes (each is ten minutes long), another is chosen for the same scene.

**Who picks the track** (follows the Models setting in 7.5; the first version picked at random within the bucket, which gave "Bubbling Pools", tagged `underground` among desert and swamp tags, for "underground caverns, exploring"):

- **Claude** (the default; `src/pick/claude-picker.ts`): Haiku reads the whole list of tracks in use (about 330 lines of id, title, settings, intensities, tags and description, roughly 17,000 tokens) in a cached system prompt, and the description or recent transcript in the request, and picks one track with a short reason. It's asked only when a track is needed (opening, scene change, track end), not on every scene check. The answer must be a listed id that suits the current intensity, or it counts as a failure. Cost per pick is roughly $0.0003 with the cache warm, about $0.003 when the cache has to be written.
- **Local** (`src/pick/local-picker.ts`, `src/pick/embed-worker.ts`): a small sentence-embedding model (`Xenova/bge-small-en-v1.5`, 8-bit, about 34 MB, run on the CPU through transformers.js in its own worker) embeds each track's title, description, tags and keywords once per session, then ranks the allowed tracks by similarity to "setting, intensity, description or latest transcript". Milliseconds per pick, no API key, no cost. This is a first implementation of experiment E9b, applied to choosing tracks rather than classifying scenes.
- **Random** within the allowed tracks, as before.
- **Fallbacks:** if the chosen picker fails, local search, then random. Local search never holds up the music for its download: if it isn't ready within a few seconds, another picker is used that time.
- **Comparison:** by default the other engine also picks, in the background, and its choice is recorded on the timeline ("Local search agrees", or "would have picked…"), so real sessions compare the two.
- A small local language model with the whole list as context was considered and rejected for now: 17,000 tokens of context takes tens of seconds to read on a laptop GPU, and small models choose poorly from long lists.

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

### 7.9 Timeline and session log

One event stream (`src/timeline.ts`) is both what the page shows and what's stored for evaluation. Each entry has the session id, its order, a timestamp and one event:

- **session:** started (with the opening description), opening scene chosen, listening started, stopped;
- **speech:** each transcript line, with its length and transcription time, including lines the hallucination filter dropped (and why);
- **call:** each classifier request: purpose (opening or scene), model, the exact user message sent, the parsed answer with confidences and reason, latency, token usage and cost, or the error;
- **decision:** after each scene call, the scene before and after, whether it changed, and a plain-words note for each axis from the state machine ("dungeon: 1 of 2 agreeing results; waiting", "calm held back: combat lasts at least 60 s, 40 s to go");
- **music:** each track started and why (opening scene, intensity changed, setting changed, last track ended, borrowed from another setting), tracks carrying on, tracks ending;
- **error:** anything that went wrong, from speech-to-text to playback.

Entries are written to IndexedDB as they happen. Buttons export the current session or all sessions as JSONL, and clear saved sessions. If the browser refuses storage, the timeline still works in memory and says so. These logs are the dataset for E8 and E9; Haiku's labels are treated as the reference, not as ground truth.

### 7.10 UI

- **Start box** (before a session): an optional opening-scene description, Start session, and the output choice (this computer or Cast).
- **Now strip** (during a session):
  - the scene in large type, how long it has lasted and why it was chosen;
  - what's pending ("→ calm (1 of 2)", "combat stays at least 40 s more");
  - a countdown to the next classifier check, or "next check when there's new speech", or "Asking Claude…";
  - the playing track with a progress bar;
  - listening status (model download progress, hearing speech), wake lock, the helper LLM's download progress, and the session's classifier calls and cost;
  - Stop session.
- **Timeline** (7.9), newest first, with tick boxes to show or hide speech, Claude calls, decisions and music, plus dropped speech. Each call can be expanded to show exactly what was sent.
- **Setup** (collapsed): API key, automatic music on or off with the privacy note, Models (Local or Claude, for scene checks and track picks) and whether to run the other for comparison, the local scene model (Gemma 4 E2B with the embeddings, and a warning where there's no WebGPU), and the speech model (Whisper sizes, or Web Speech on-device or cloud).
- **Pick tracks yourself** (collapsed): the manual track picker, transport controls and the raw playback log.
- **Attribution footer:** "Ambiences by Tabletop Audio (tabletopaudio.com), CC BY-NC-ND 4.0", with links, and a link to the source code. The current track's title, shown in the Now strip, completes the per-work attribution.
- **Wake lock:** held while listening, re-requested when the tab becomes visible again, with a warning when lost (7.2, section 4).

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
/src/stt           Whisper (transformers.js) wrapper; Web Speech alternative
/src/llm           helper LLM for local scene checks (WebGPU worker)
/src/classify      Claude classifier (Anthropic SDK), prompt, cost; local (embedding) classifier
/src/scene         transcript buffer, state machine, track selector
/src/pick          track choosers: Claude (whole track list), local embedding search (worker)
/src/eval          scripted scenarios for checking classifiers, and the local classifier's browser evaluation
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

**E9 — Local classifiers.** Done ([experiments/E9.md](experiments/E9.md)): candidates were scored against hand-labelled scenes (`src/eval/test-set.ts`, 108 held out) rather than Haiku logs, first on a CPU, then on a local GPU through the app's own code. Embeddings alone get 64% of held-out scenes right; nearest-track voting, zero-shot NLI and LLMs under 1B parameters do worse; Gemma 4 E2B blended with the embeddings gets 83% and is what the app uses (7.5). Chrome's built-in Prompt API wasn't tried.

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
- **M4 — Instrumentation:** the timeline (7.9) doubles as the IndexedDB session log with JSONL export, and the page is reorganised around it (7.10). Done; next, run E8 over real sessions, and E10 alongside it.
- **M5 — Local classifier experiments:** E9, then decide whether the API key remains necessary. Done: local models are the default, with Gemma 4 E2B (7.5).

Agreed next steps (cleanup, more model experiments, Gemma 4 for speech, UI) are in [BACKLOG.md](BACKLOG.md).

## 11. Later and out of scope

- Manual DM overrides, and using them as correction labels in the evaluation set.
- Phone remote via a small relay, such as a Cloudflare Worker with WebSockets.
- Syrinscape one-shot sound effects triggered by keywords, via a CORS proxy.
- Patreon alternate versions, which would allow independent music and ambience channels: setting drives the ambience, and intensity drives the music.
- A custom Cast receiver for true crossfades on Cast devices.

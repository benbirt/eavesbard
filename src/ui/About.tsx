import { FAN_CONTENT_NOTICE, FAN_CONTENT_POLICY_URL } from "../art/scene-art.js";
import { library } from "../library-data.js";
import { SCENE_LLM } from "../llm/llm-protocol.js";
import { WHISPER_DOWNLOAD_MB } from "../stt/protocol.js";
import { ArtCredits } from "./SceneArt.js";

/** One line on what Eavesbard is, by the name. */
export const TAGLINE = "Listens to your tabletop game and plays music that fits the scene";

/** What Eavesbard is, how it works, what it downloads and sends, and the credits. */
export function About() {
  return (
    <>
      <section class="section">
        <h3>What it is</h3>
        <p>
          Eavesbard listens to your tabletop role-playing session and plays ambient music that fits what's happening: a
          calm tavern, a tense crypt, a fight on the road. Leave it running on a laptop at the table, or cast it to a
          speaker.
        </p>
      </section>

      <section class="section">
        <h3>How it works</h3>
        <ol class="steps">
          <li>It listens through the microphone and turns speech into text.</li>
          <li>
            Every 15 seconds, while people are talking, it decides the scene: where the party is (tavern, town,
            interior, wilderness, dungeon or travel) and how intense it is (calm, tense or combat).
          </li>
          <li>
            When the scene changes, it crossfades to a fitting track from {library.tracks.length} fantasy ambiences by
            Tabletop Audio.
          </li>
        </ol>
        <p>It can get it wrong: tap the scene buttons to correct it, and it carries on from there.</p>
      </section>

      <section class="section">
        <h3>Privacy</h3>
        <p>
          With the default settings everything runs in this browser, and nothing you say leaves your computer. Two
          choices in Setup change that:
        </p>
        <ul class="steps">
          <li>
            <b>Listening with the browser's own speech recognition</b> (Web Speech, cloud) sends the audio to the
            browser's maker, such as Google for Chrome. The on-device Web Speech option and Whisper don't.
          </li>
          <li>
            <b>Claude deciding the scene</b> sends the last two and a half minutes of transcript to Anthropic with
            each scene check (and so does asking Claude for comparison, under Debug options).
          </li>
        </ul>
        <p>The session log is kept only until you close or reload the page.</p>
        <p>
          Eavesbard uses cookieless <a href="https://posthog.com/">PostHog</a> analytics to count visits and how it's
          used. Nothing said at the table is ever sent. Turn it off with "Count my visits" in Setup.
        </p>
      </section>

      <section class="section">
        <h3>Downloads</h3>
        <p>
          Models downloaded to this computer are cached and remain available for future visits: for transcription,
          Whisper ({WHISPER_DOWNLOAD_MB["tiny.en"]}–{WHISPER_DOWNLOAD_MB["small.en"]} MB, depending on the size chosen
          in Setup), and for scene classification, {SCENE_LLM.name} (about{" "}
          {(SCENE_LLM.downloadMb / 1000).toFixed(1)} GB). Once a model has fully downloaded, it loads by itself when you
          open Eavesbard.
        </p>
        <p>Nothing downloads until you choose to, and a download can be paused and resumed, even after a reload.</p>
      </section>

      <section class="section" id="credits">
        <h3>Credits</h3>
        <p>
          Ambiences by <a href="https://tabletopaudio.com/">Tabletop Audio</a>, licensed{" "}
          <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/">CC BY-NC-ND 4.0</a>.
        </p>
        <p>Art:</p>
        <ArtCredits />
        <p class="small">
          {FAN_CONTENT_NOTICE} <a href={FAN_CONTENT_POLICY_URL}>Fan Content Policy</a>.
        </p>
        <p class="small">
          Cinzel by Natanael Gama (SIL Open Font License). Cast icon from Material Icons (Apache License 2.0); GitHub
          mark from Octicons (MIT).
        </p>
        <p>
          <a class="github-link" href="https://github.com/benbirt/eavesbard">
            Source code on GitHub{" "}
            {/* GitHub's mark (Octicons, MIT licence). */}
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
            </svg>
          </a>
        </p>
      </section>
    </>
  );
}

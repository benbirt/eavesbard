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
          <li>It listens through the microphone and turns speech into text, on this computer.</li>
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
        <h3>Privacy and downloads</h3>
        <p>
          By default everything runs in this browser and nothing you say leaves your computer. If you choose Claude in
          Setup, the last two and a half minutes of transcript go to Anthropic with each scene check. The session log
          is kept only until you close or reload the page.
        </p>
        <p>
          The models download once and the browser keeps them: speech recognition (Whisper, {WHISPER_DOWNLOAD_MB["tiny.en"]}–
          {WHISPER_DOWNLOAD_MB["small.en"]} MB) and the scene model ({SCENE_LLM.name}, about{" "}
          {(SCENE_LLM.downloadMb / 1000).toFixed(1)} GB). Nothing downloads until you choose to, and downloads can be paused and resumed, even after a reload.
        </p>
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
          mark from Octicons (MIT). <a href="https://github.com/benbirt/eavesbard">Source code on GitHub</a>.
        </p>
      </section>
    </>
  );
}

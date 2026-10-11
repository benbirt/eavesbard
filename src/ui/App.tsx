import { useEffect } from "preact/hooks";
import { FAN_CONTENT_NOTICE, FAN_CONTENT_POLICY_URL } from "../art/scene-art.js";
import { auto, scene, sessionActive } from "../director.js";
import { nowPlaying } from "../player.js";
import { ListeningChip, ModelChip } from "./Chips.js";
import { Drawer, Scrim, toggleDrawer } from "./Drawer.js";
import { CastButton } from "./Playback.js";
import { Ambient, ArtCredits, ArtFrame } from "./SceneArt.js";
import { MusicCard, SceneCard, StartCard, StopButton } from "./Session.js";
import { Settings } from "./Settings.js";
import { Timeline } from "./Timeline.js";
import { TrackPicker } from "./TrackPicker.js";

// The notice must appear word for word; its mention of the policy becomes the link.
const [before, after] = FAN_CONTENT_NOTICE.split("Fan Content Policy") as [string, string];

export function App() {
  const intensity = scene.value?.intensity ?? "calm";
  // The intensity colours the controls (never the art).
  useEffect(() => {
    document.body.dataset.intensity = intensity;
  }, [intensity]);
  return (
    <>
      <Ambient />
      <div class="app">
        <header class="top">
          <div class="brand">Eavesbard</div>
          <ListeningChip />
          <ModelChip />
          <CastButton />
          <button type="button" class="iconbtn" onClick={() => toggleDrawer("log")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
            Log
          </button>
          <button type="button" class="iconbtn" onClick={() => toggleDrawer("setup")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
            </svg>
            Setup
          </button>
          <a class="iconbtn github" href="https://github.com/benbirt/eavesbard" aria-label="Source code on GitHub" title="Source code on GitHub">
            {/* GitHub's mark (Octicons, MIT licence). */}
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
            </svg>
          </a>
        </header>
        <main class="stage">
          <ArtFrame />
          <div class="col">
            {sessionActive.value ? (
              <>
                {auto.value && <SceneCard />}
                <MusicCard />
                {!auto.value && <TrackPicker />}
                <StopButton />
              </>
            ) : (
              <>
                <StartCard />
                {/* With automatic music off, music is picked by hand, session or not. */}
                {!auto.value && nowPlaying.value && <MusicCard />}
                {!auto.value && <TrackPicker />}
              </>
            )}
          </div>
        </main>
        <footer class="foot">
          <p>
            Music: <a href="https://tabletopaudio.com/">Tabletop Audio</a>, licensed{" "}
            <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/">CC BY-NC-ND 4.0</a>
          </p>
          <details class="art-credits">
            <summary>Art: Wizards of the Coast · credits</summary>
            <ArtCredits />
          </details>
          <p class="notice">
            {before}
            <a href={FAN_CONTENT_POLICY_URL}>Fan Content Policy</a>
            {after}
          </p>
        </footer>
      </div>
      <Scrim />
      <Drawer name="log" title="Session log">
        <Timeline />
      </Drawer>
      <Drawer name="setup" title="Setup">
        <Settings />
      </Drawer>
    </>
  );
}

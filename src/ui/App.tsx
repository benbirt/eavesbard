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
          <p>
            <a href="https://github.com/benbirt/eavesbard">Source code on GitHub</a>
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

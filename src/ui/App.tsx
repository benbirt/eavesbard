import { useEffect } from "preact/hooks";
import { auto, scene, sessionActive } from "../director.js";
import { nowPlaying } from "../player.js";
import { DownloadControl, ListeningChip, ModelChip } from "./Chips.js";
import { Scrim, SidePanel, toggleDrawer } from "./Drawer.js";
import { CastButton } from "./Playback.js";
import { About, TAGLINE } from "./About.js";
import { Ambient, ArtFrame } from "./SceneArt.js";
import { MusicCard, SceneCard, StartCard, StopButton } from "./Session.js";
import { Settings } from "./Settings.js";
import { Timeline } from "./Timeline.js";
import { TrackPicker } from "./TrackPicker.js";

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
          <button type="button" class="brand-block" onClick={() => toggleDrawer("about")} title="About Eavesbard">
            <span class="brand">Eavesbard</span>
            <span class="tagline">{TAGLINE}</span>
          </button>
          <ListeningChip />
          <ModelChip />
          <DownloadControl />
          <CastButton />
          <button type="button" class="iconbtn more" aria-haspopup="dialog" onClick={() => toggleDrawer("setup")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            More…
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
      </div>
      <Scrim />
      <SidePanel panels={{ setup: <Settings />, log: <Timeline />, about: <About /> }} />
    </>
  );
}

import { useEffect } from "preact/hooks";
import { FAN_CONTENT_NOTICE, FAN_CONTENT_POLICY_URL } from "../art/scene-art.js";
import { scene, sessionActive } from "../director.js";
import { ListeningChip, ModelChip } from "./Chips.js";
import { Drawer, openDrawer, Scrim, toggleDrawer } from "./Drawer.js";
import { Ambient, ArtFrame } from "./SceneArt.js";
import { MusicCard, SceneCard, StartCard, StopButton } from "./Session.js";
import { Settings } from "./Settings.js";
import { Timeline } from "./Timeline.js";

// The notice must appear word for word; its mention of the policy becomes the link.
const [before, after] = FAN_CONTENT_NOTICE.split("Fan Content Policy") as [string, string];

/** Opens Setup at the art credits. */
function showCredits(): void {
  openDrawer.value = "setup";
  requestAnimationFrame(() => document.getElementById("about")?.scrollIntoView({ block: "start" }));
}

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
                <SceneCard />
                <MusicCard />
                <StopButton />
              </>
            ) : (
              <StartCard />
            )}
          </div>
        </main>
        <footer class="foot">
          <p>
            Music: <a href="https://tabletopaudio.com/">Tabletop Audio</a>, licensed{" "}
            <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/">CC BY-NC-ND 4.0</a>
          </p>
          <p>
            Art: Wizards of the Coast ·{" "}
            <button type="button" class="link" onClick={showCredits}>
              credits
            </button>
          </p>
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

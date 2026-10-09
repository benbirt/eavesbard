import { EventLog } from "./EventLog.js";
import { Transport } from "./Playback.js";
import { Session } from "./Session.js";
import { Settings } from "./Settings.js";
import { Timeline } from "./Timeline.js";
import { TrackPicker } from "./TrackPicker.js";

export function App() {
  return (
    <>
      <h1>Eavesbard</h1>
      <Session />
      <Timeline />
      <details>
        <summary>Setup</summary>
        <Settings />
      </details>
      <details>
        <summary>Pick tracks yourself</summary>
        <fieldset>
          <TrackPicker />
          <Transport />
          <details>
            <summary class="muted">Playback log</summary>
            <EventLog />
          </details>
        </fieldset>
      </details>
      <footer>
        Ambiences by <a href="https://tabletopaudio.com/">Tabletop Audio</a>, licensed{" "}
        <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/">CC BY-NC-ND 4.0</a>. Source code on{" "}
        <a href="https://github.com/benbirt/eavesbard">GitHub</a>.
      </footer>
    </>
  );
}

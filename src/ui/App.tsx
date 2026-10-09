import { EventLog } from "./EventLog.js";
import { Listening } from "./Listening.js";
import { OutputChooser, Transport } from "./Playback.js";
import { Settings } from "./Settings.js";
import { TrackPicker } from "./TrackPicker.js";

export function App() {
  return (
    <>
      <h1>Eavesbard</h1>
      <Settings />
      <Listening />
      <fieldset>
        <legend>Track picker</legend>
        <TrackPicker />
        <OutputChooser />
        <Transport />
        <p class="muted">
          Check in dev tools (Network) that audio requests carry no <code>Origin</code> header: the audio host refuses
          them with 403 if they do.
        </p>
        <EventLog />
      </fieldset>
      <footer>
        Ambiences by <a href="https://tabletopaudio.com/">Tabletop Audio</a>, licensed{" "}
        <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/">CC BY-NC-ND 4.0</a>.
      </footer>
    </>
  );
}

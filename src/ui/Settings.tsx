import { useState } from "preact/hooks";
import { auto, engine, setAuto, setEngine } from "../director.js";
import { loadApiKey, saveApiKey } from "../settings.js";
import { EventLog } from "./EventLog.js";
import { SpeechModelChooser } from "./Listening.js";
import { OutputSwitch, Transport } from "./Playback.js";
import { ArtCredits } from "./SceneArt.js";
import { LocalModelsNote } from "./SceneLlm.js";
import { TrackPicker } from "./TrackPicker.js";

function ApiKey() {
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [status, setStatus] = useState("");
  return (
    <form
      class="key"
      onSubmit={(e) => {
        e.preventDefault();
        const key = apiKey.trim();
        setStatus(saveApiKey(key) ? (key ? "Saved in this browser." : "Cleared.") : "Couldn't save: this browser is blocking storage.");
      }}
    >
      <label>
        Anthropic API key
        <input class="field" type="password" autoComplete="off" value={apiKey} onInput={(e) => setApiKey(e.currentTarget.value)} />
      </label>
      <button type="submit" class="btn">
        Save
      </button>{" "}
      <span class="small" role="status">
        {status}
      </span>
      <p>
        Stored only in this browser. While a session runs, the last two and a half minutes of transcript go to Anthropic
        every 15 seconds: let the table know.{!loadApiKey() && " Without a key, the models on this computer are used."}
      </p>
    </form>
  );
}

/** Everything that isn't needed mid-session. */
export function Settings() {
  return (
    <>
      <section class="section">
        <label class="toggle">
          <h3>Choose music automatically</h3>
          <input type="checkbox" checked={auto.value} onChange={(e) => setAuto(e.currentTarget.checked)} />
        </label>
        <p>Listens to the table and changes the music with the scene.</p>
      </section>

      <section class="section">
        <h3>Who decides the scene</h3>
        <label class="radio">
          <input type="radio" name="engine" checked={engine.value === "local"} onChange={() => setEngine("local")} />
          <span>
            On this computer <LocalModelsNote />
          </span>
        </label>
        <label class="radio">
          <input type="radio" name="engine" checked={engine.value === "claude"} onChange={() => setEngine("claude")} />
          <span>
            Claude <small>Needs an Anthropic API key · about 10–30 cents a session · reads the whole track list</small>
          </span>
        </label>
        {engine.value === "claude" && <ApiKey />}
      </section>

      <section class="section">
        <h3>Listening</h3>
        <SpeechModelChooser />
      </section>

      <section class="section">
        <h3>Play on</h3>
        <OutputSwitch withHint />
      </section>

      <section class="section">
        <h3>Pick a track yourself</h3>
        <TrackPicker />
        <Transport />
        <details>
          <summary class="small">Playback log</summary>
          <EventLog />
        </details>
      </section>

      <section class="section">
        <h3>About</h3>
        <p>
          Ambiences by <a href="https://tabletopaudio.com/">Tabletop Audio</a>, licensed{" "}
          <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/">CC BY-NC-ND 4.0</a>. Source code on{" "}
          <a href="https://github.com/benbirt/eavesbard">GitHub</a>.
        </p>
        <ArtCredits />
      </section>
    </>
  );
}

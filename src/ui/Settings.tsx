import { useState } from "preact/hooks";
import { auto, engine, sessionActive, setAuto, setEngine } from "../director.js";
import { loadApiKey, resetSettings, saveApiKey } from "../settings.js";
import { SpeechModelChooser } from "./Listening.js";
import { LocalModelsNote } from "./SceneLlm.js";

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

/** Back to the defaults: options and the API key, with a confirmation step. */
function ResetSection() {
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <section class="section">
      <h3>Reset to defaults</h3>
      <p>Clears the options above and the Anthropic API key saved in this browser, then reloads the page. Downloaded models stay.</p>
      {sessionActive.value ? (
        <p class="small">Stop the session first.</p>
      ) : asking ? (
        <p>
          <button
            type="button"
            class="btn"
            onClick={() => {
              if (resetSettings()) location.reload();
              else setFailed(true);
            }}
          >
            Yes, reset
          </button>{" "}
          <button type="button" class="btn" onClick={() => setAsking(false)}>
            Cancel
          </button>
        </p>
      ) : (
        <p>
          <button type="button" class="btn" onClick={() => setAsking(true)}>
            Reset to defaults…
          </button>
        </p>
      )}
      {failed && <p class="warning small">This browser is blocking storage, so there was nothing to reset.</p>}
    </section>
  );
}

/** Options, kept out of the way of a session. */
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

      <ResetSection />
    </>
  );
}

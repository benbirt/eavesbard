import { useState } from "preact/hooks";
import { auto, setAuto } from "../director.js";
import { loadApiKey, saveApiKey } from "../settings.js";
import { SpeechModelChooser } from "./Listening.js";

export function Settings() {
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [status, setStatus] = useState("");

  const save = (e: SubmitEvent) => {
    e.preventDefault();
    const key = apiKey.trim();
    setStatus(
      saveApiKey(key)
        ? key
          ? "Saved in this browser."
          : "Cleared."
        : "Couldn't save: this browser is blocking local storage.",
    );
  };

  return (
    <form onSubmit={save}>
      <fieldset>
        <legend>Settings</legend>
        <label>
          Anthropic API key{" "}
          <input
            type="password"
            autoComplete="off"
            size={40}
            value={apiKey}
            onInput={(e) => setApiKey(e.currentTarget.value)}
          />
        </label>
        <button type="submit">Save</button>{" "}
        <span class="muted" role="status">
          {status}
        </span>
        <p class="muted">Stored only in this browser's local storage.</p>
        <label>
          <input type="checkbox" checked={auto.value} onChange={(e) => setAuto(e.currentTarget.checked)} /> Choose music
          automatically from what's said
        </label>
        <p class="muted">
          While a session runs, the last two and a half minutes of transcript are sent to Anthropic every 15 seconds to
          work out the scene. Let the table know.
        </p>
        <SpeechModelChooser />
      </fieldset>
    </form>
  );
}

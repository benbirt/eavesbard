import { useState } from "preact/hooks";
import { auto, compare, engine, setAuto, setCompare, setEngine } from "../director.js";
import type { Engine } from "../timeline.js";
import { loadApiKey, saveApiKey } from "../settings.js";
import { SpeechModelChooser } from "./Listening.js";
import { SceneLlmInfo } from "./SceneLlm.js";

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
          Whenever Claude is used (as the model, or alongside for comparison, with an API key), the last two and a half
          minutes of transcript are sent to Anthropic every 15 seconds to work out the scene. Let the table know.
        </p>
        <label>
          Models{" "}
          <select value={engine.value} onChange={(e) => setEngine(e.currentTarget.value as Engine)}>
            <option value="local">Local: models on this computer, no key or cost (downloaded once)</option>
            <option value="claude">Claude: decides scenes and reads the whole track list (needs the API key)</option>
          </select>
        </label>
        <SceneLlmInfo />
        <label>
          <input type="checkbox" checked={compare.value} onChange={(e) => setCompare(e.currentTarget.checked)} /> Also run
          the other models and show their answers, for comparison (Claude only with an API key)
        </label>
        <SpeechModelChooser />
      </fieldset>
    </form>
  );
}

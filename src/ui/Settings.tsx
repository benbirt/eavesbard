import { useState } from "preact/hooks";
import { auto, engine, setAuto, setEngine } from "../director.js";
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
          <input type="checkbox" checked={auto.value} onChange={(e) => setAuto(e.currentTarget.checked)} /> Choose music
          automatically from what's said
        </label>
        <label>
          Models{" "}
          <select value={engine.value} onChange={(e) => setEngine(e.currentTarget.value as Engine)}>
            <option value="local">Local: models on this computer, no key or cost (downloaded once)</option>
            <option value="claude">Claude: decides scenes and reads the whole track list (needs an Anthropic API key)</option>
          </select>
        </label>
        {engine.value === "claude" ? (
          <>
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
            <p class="muted">
              Stored only in this browser's local storage. While a session runs, the last two and a half minutes of
              transcript are sent to Anthropic every 15 seconds to work out the scene. Let the table know.
              {!loadApiKey() && " Without a key, the local models are used."}
            </p>
          </>
        ) : (
          <SceneLlmInfo />
        )}
        <SpeechModelChooser />
      </fieldset>
    </form>
  );
}

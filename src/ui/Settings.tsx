import { useState } from "preact/hooks";
import { auto, compare, engine, sessionActive, setAuto, setCompare, setEngine } from "../director.js";
import { loadApiKey, resetSettings, saveApiKey } from "../settings.js";
import { SpeechModelChooser } from "./Listening.js";
import { LocalModelsNote } from "./SceneLlm.js";

/**
 * The Anthropic API key. A saved key is never put back into the page: the
 * panel only says one is saved, with buttons to replace or remove it.
 */
function ApiKey({ onChange }: { onChange?: () => void }) {
  const [saved, setSaved] = useState(() => loadApiKey() !== "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const store = (key: string) => {
    if (!saveApiKey(key)) {
      setStatus("Couldn't save: this browser is blocking storage.");
      return;
    }
    setSaved(key !== "");
    onChange?.();
    setEditing(false);
    setDraft("");
    setStatus(key ? "Saved." : "Removed.");
  };
  return (
    <div class="key">
      {saved && !editing ? (
        <p>
          <span class="saved-key">✓ An API key is saved in this browser.</span>{" "}
          <button type="button" class="btn" onClick={() => (setEditing(true), setStatus(""))}>
            Replace
          </button>{" "}
          <button type="button" class="btn" onClick={() => store("")}>
            Remove
          </button>{" "}
          <span class="small" role="status">
            {status}
          </span>
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) store(draft.trim());
          }}
        >
          <label>
            {saved ? "New Anthropic API key" : "Anthropic API key"}
            <input
              class="field"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={draft}
              onInput={(e) => setDraft(e.currentTarget.value)}
            />
          </label>
          <button type="submit" class="btn" disabled={!draft.trim()}>
            Save
          </button>{" "}
          {saved && (
            <button type="button" class="btn" onClick={() => (setEditing(false), setDraft(""))}>
              Cancel
            </button>
          )}{" "}
          <span class="small" role="status">
            {status}
          </span>
        </form>
      )}
      <p>
        Stored only in this browser. While a session runs, the last two and a half minutes of transcript go to Anthropic
        every 15 seconds: let the table know.{!saved && " Without a key, the models on this computer are used."}
      </p>
    </div>
  );
}

/** Options for testing and comparing models, collapsed by default. */
function DebugSection() {
  const other = engine.value === "claude" ? "the local models" : "Claude";
  // Re-read the key after it's saved or removed below.
  const [, keyChanged] = useState(0);
  const needsKey = engine.value === "local" && !loadApiKey();
  return (
    <details class="section debug">
      <summary>
        <h3>Debug options</h3>
      </summary>
      <label class="toggle">
        <span>Also ask {other}, for comparison</span>
        <input type="checkbox" checked={compare.value} onChange={(e) => setCompare(e.currentTarget.checked)} />
      </label>
      <p>
        Each scene check is also sent to {other}. Its answers appear in the session log under Model details, marked
        “comparison”, and change nothing. Asking Claude needs an Anthropic API key, and costs about 10–30 cents a session.
      </p>
      {compare.value && engine.value === "local" && (
        <>
          {needsKey && <p class="warning small">No API key is saved, so Claude can't be asked yet. Add one here:</p>}
          <ApiKey onChange={() => keyChanged((n) => n + 1)} />
        </>
      )}
    </details>
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

      <DebugSection />

      <ResetSection />
    </>
  );
}

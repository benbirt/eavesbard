import assert from "node:assert/strict";
import { test } from "node:test";

// A minimal localStorage for Node.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const { loadApiKey, loadSetting, resetSettings, saveApiKey, saveSetting } = await import("./settings.js");

test("reset clears options and the API key but keeps the opening description and other sites' data", () => {
  saveApiKey("sk-test");
  saveSetting("engine", "claude");
  saveSetting("whisperModel", "tiny.en");
  saveSetting("auto", "off");
  saveSetting("openingDescription", "a smoky tavern");
  store.set("someone-else", "x");
  assert.equal(resetSettings(), true);
  assert.equal(loadApiKey(), "");
  assert.equal(loadSetting("engine"), undefined);
  assert.equal(loadSetting("whisperModel"), undefined);
  assert.equal(loadSetting("auto"), undefined);
  assert.equal(loadSetting("openingDescription"), "a smoky tavern");
  assert.equal(store.get("someone-else"), "x");
});

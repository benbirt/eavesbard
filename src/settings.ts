const API_KEY = "eavesbard.anthropicApiKey";

// localStorage can throw (blocked site data, some private modes), so every
// access is guarded and the app carries on without a stored key.

export function loadApiKey(): string {
  try {
    return localStorage.getItem(API_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Stores the key, or clears it when empty. Returns whether it was saved. */
export function saveApiKey(key: string): boolean {
  try {
    if (key) localStorage.setItem(API_KEY, key);
    else localStorage.removeItem(API_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Reads a stored preference. Returns undefined if unset or storage is blocked. */
export function loadSetting(name: string): string | undefined {
  try {
    return localStorage.getItem(`eavesbard.${name}`) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Stores a preference, ignoring blocked storage. */
export function saveSetting(name: string, value: string): void {
  try {
    localStorage.setItem(`eavesbard.${name}`, value);
  } catch {
    // Preferences are a convenience; carry on without them.
  }
}

/** Settings kept by a reset: the user's own text, whether usage is counted (a privacy choice), and which models are downloaded (the models stay). */
const KEPT_ON_RESET = ["eavesbard.openingDescription", "eavesbard.analytics"];
const KEPT_PREFIX_ON_RESET = "eavesbard.downloaded.";

/**
 * Clears stored options and the API key, so the defaults apply after a
 * reload. Returns whether storage allowed it.
 */
export function resetSettings(): boolean {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(
      (k): k is string => k !== null && k.startsWith("eavesbard.") && !KEPT_ON_RESET.includes(k) && !k.startsWith(KEPT_PREFIX_ON_RESET),
    );
    for (const k of keys) localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

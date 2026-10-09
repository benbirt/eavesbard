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

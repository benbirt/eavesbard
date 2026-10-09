// The scene state machine (DESIGN.md 7.6): turns classifier results into
// scene changes, with hysteresis so the music doesn't flap.
// A pure function of (state, event, options), so it's testable without audio
// or network.

import type { Intensity, Setting } from "../library/scenes.js";

export interface SceneOptions {
  startSetting: Setting;
  startIntensity: Intensity;
  /** Classifier confidence needed to enter combat immediately. */
  combatEntryConfidence: number;
  /** Confidence in a non-combat intensity needed to leave combat on one result. */
  combatExitConfidence: number;
  /** Results on an axis below this confidence are ignored on that axis. */
  minConfidence: number;
  /** Consecutive agreeing results needed for a change (other than entering combat). */
  agreeingResults: number;
  /** Minimum time on a setting before it can change. */
  minSettingMs: number;
  /** Minimum time in combat before it can end. */
  minCombatMs: number;
}

export const DEFAULT_SCENE_OPTIONS: SceneOptions = {
  startSetting: "tavern",
  startIntensity: "calm",
  combatEntryConfidence: 0.6,
  combatExitConfidence: 0.8,
  minConfidence: 0.5,
  agreeingResults: 2,
  minSettingMs: 3 * 60_000,
  minCombatMs: 60_000,
};

export interface SceneEvent {
  type: "classification";
  setting: Setting | "unknown";
  settingConfidence: number;
  intensity: Intensity;
  intensityConfidence: number;
  at: number;
}

interface Streak<T> {
  value: T;
  count: number;
}

export interface SceneState {
  setting: Setting;
  intensity: Intensity;
  settingSince: number;
  intensitySince: number;
  /** Why the scene last changed. */
  reason: string;
  pendingSetting?: Streak<Setting>;
  pendingIntensity?: Streak<Intensity>;
}

export function initialScene(
  at: number,
  start: { setting: Setting; intensity: Intensity; reason: string } | undefined = undefined,
  options = DEFAULT_SCENE_OPTIONS,
): SceneState {
  return {
    setting: start?.setting ?? options.startSetting,
    intensity: start?.intensity ?? options.startIntensity,
    settingSince: at,
    intensitySince: at,
    reason: start?.reason ?? "default starting scene",
  };
}

export interface Transition {
  state: SceneState;
  /** True if the setting or intensity changed (one transition even if both did). */
  changed: boolean;
  /** What happened on each axis, in plain words, for the timeline. */
  notes: { setting: string; intensity: string };
}

export function nextScene(state: SceneState, event: SceneEvent, options = DEFAULT_SCENE_OPTIONS): Transition {
  const next: SceneState = { ...state };
  const notes = { setting: "", intensity: "" };
  // Reported setting first, then intensity.
  const reasons: { setting?: string; intensity?: string } = {};
  const waitFor = (sinceMs: number, minMs: number) => Math.ceil((minMs - (event.at - sinceMs)) / 1000);

  // --- Intensity ---
  const intensity = event.intensity;
  if (event.intensityConfidence < options.minConfidence) {
    // Low confidence: ignored, so the streak neither grows nor resets.
    notes.intensity = `${intensity} ignored: only ${pct(event.intensityConfidence)} confident.`;
  } else if (intensity === state.intensity) {
    notes.intensity = state.pendingIntensity
      ? `still ${intensity}; dropped the pending change to ${state.pendingIntensity.value}.`
      : `still ${intensity}.`;
    next.pendingIntensity = undefined;
  } else if (intensity === "combat" && event.intensityConfidence >= options.combatEntryConfidence) {
    Object.assign(next, { intensity, intensitySince: event.at, pendingIntensity: undefined });
    reasons.intensity = `classifier: combat (${pct(event.intensityConfidence)})`;
    notes.intensity = `${state.intensity} → combat at once (${pct(event.intensityConfidence)} confident).`;
  } else {
    const streak = bump(state.pendingIntensity, intensity);
    const leavingCombat = state.intensity === "combat";
    const heldFor = leavingCombat ? waitFor(state.intensitySince, options.minCombatMs) : 0;
    const confidentExit = leavingCombat && event.intensityConfidence >= options.combatExitConfidence;
    const agreed = streak.count >= options.agreeingResults || confidentExit;
    if (agreed && heldFor <= 0) {
      Object.assign(next, { intensity, intensitySince: event.at, pendingIntensity: undefined });
      const why =
        streak.count >= options.agreeingResults
          ? `${streak.count} results agree`
          : `${pct(event.intensityConfidence)} confident, combat over`;
      reasons.intensity = `classifier: ${intensity} (${why})`;
      notes.intensity = `${state.intensity} → ${intensity} (${why}).`;
    } else {
      next.pendingIntensity = streak;
      notes.intensity =
        agreed
          ? `${intensity} held back: combat lasts at least ${options.minCombatMs / 1000} s, ${heldFor} s to go.`
          : `${intensity}: ${streak.count} of ${options.agreeingResults} agreeing results` +
            `${leavingCombat ? ` (or one at ${pct(options.combatExitConfidence)}+)` : ""}; waiting.`;
    }
  }

  // --- Setting ---
  const setting = event.setting;
  if (setting === "unknown") {
    notes.setting = "unknown: no change.";
  } else if (event.settingConfidence < options.minConfidence) {
    notes.setting = `${setting} ignored: only ${pct(event.settingConfidence)} confident.`;
  } else if (setting === state.setting) {
    notes.setting = state.pendingSetting
      ? `still ${setting}; dropped the pending change to ${state.pendingSetting.value}.`
      : `still ${setting}.`;
    next.pendingSetting = undefined;
  } else {
    const streak = bump(state.pendingSetting, setting);
    const heldFor = waitFor(state.settingSince, options.minSettingMs);
    if (streak.count >= options.agreeingResults && heldFor <= 0) {
      Object.assign(next, { setting, settingSince: event.at, pendingSetting: undefined });
      reasons.setting = `classifier: ${setting} (${streak.count} results agree)`;
      notes.setting = `${state.setting} → ${setting} (${streak.count} results agree).`;
    } else {
      next.pendingSetting = streak;
      notes.setting =
        streak.count >= options.agreeingResults
          ? `${setting} held back: a setting lasts at least ${options.minSettingMs / 60_000} minutes, ${heldFor} s to go.`
          : `${setting}: ${streak.count} of ${options.agreeingResults} agreeing results; waiting.`;
    }
  }

  const changed = next.setting !== state.setting || next.intensity !== state.intensity;
  if (changed) next.reason = [reasons.setting, reasons.intensity].filter(Boolean).join("; ");
  return { state: next, changed, notes };
}

/** Changes under consideration, for the "now" display: e.g. "dungeon (1 of 2)". */
export function pendingChanges(state: SceneState, now: number, options = DEFAULT_SCENE_OPTIONS): string[] {
  const out: string[] = [];
  if (state.pendingSetting) out.push(`→ ${state.pendingSetting.value} (${state.pendingSetting.count} of ${options.agreeingResults})`);
  if (state.pendingIntensity) out.push(`→ ${state.pendingIntensity.value} (${state.pendingIntensity.count} of ${options.agreeingResults})`);
  if (state.intensity === "combat") {
    const left = Math.ceil((options.minCombatMs - (now - state.intensitySince)) / 1000);
    if (left > 0) out.push(`combat stays at least ${left} s more`);
  }
  return out;
}

/** Extends a streak of agreeing results, or starts a new one. */
function bump<T>(streak: Streak<T> | undefined, value: T): Streak<T> {
  return streak?.value === value ? { value, count: streak.count + 1 } : { value, count: 1 };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

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
  minConfidence: 0.5,
  agreeingResults: 2,
  minSettingMs: 3 * 60_000,
  minCombatMs: 3 * 60_000,
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

export function initialScene(at: number, options = DEFAULT_SCENE_OPTIONS): SceneState {
  return {
    setting: options.startSetting,
    intensity: options.startIntensity,
    settingSince: at,
    intensitySince: at,
    reason: "starting scene",
  };
}

export interface Transition {
  state: SceneState;
  /** True if the setting or intensity changed (one transition even if both did). */
  changed: boolean;
}

export function nextScene(state: SceneState, event: SceneEvent, options = DEFAULT_SCENE_OPTIONS): Transition {
  const next: SceneState = { ...state };
  // Reported setting first, then intensity.
  const reasons: { setting?: string; intensity?: string } = {};

  // --- Intensity ---
  if (event.intensityConfidence >= options.minConfidence) {
    const value = event.intensity;
    if (value === state.intensity) {
      next.pendingIntensity = undefined;
    } else if (value === "combat" && event.intensityConfidence >= options.combatEntryConfidence) {
      Object.assign(next, { intensity: value, intensitySince: event.at, pendingIntensity: undefined });
      reasons.intensity = `classifier: combat (${pct(event.intensityConfidence)})`;
    } else {
      const streak = bump(state.pendingIntensity, value);
      const combatHeld = state.intensity === "combat" && event.at - state.intensitySince < options.minCombatMs;
      if (streak.count >= options.agreeingResults && !combatHeld) {
        Object.assign(next, { intensity: value, intensitySince: event.at, pendingIntensity: undefined });
        reasons.intensity = `classifier: ${value} (${streak.count} results agree)`;
      } else {
        next.pendingIntensity = streak;
      }
    }
  }
  // Low-confidence intensity: ignored, so the streak neither grows nor resets.

  // --- Setting ---
  if (event.setting !== "unknown" && event.settingConfidence >= options.minConfidence) {
    const value = event.setting;
    if (value === state.setting) {
      next.pendingSetting = undefined;
    } else {
      const streak = bump(state.pendingSetting, value);
      const settled = event.at - state.settingSince >= options.minSettingMs;
      if (streak.count >= options.agreeingResults && settled) {
        Object.assign(next, { setting: value, settingSince: event.at, pendingSetting: undefined });
        reasons.setting = `classifier: ${value} (${streak.count} results agree)`;
      } else {
        next.pendingSetting = streak;
      }
    }
  }
  // `unknown` or low confidence: keep doing what we're doing; the streak is untouched.

  const changed = next.setting !== state.setting || next.intensity !== state.intensity;
  if (changed) next.reason = [reasons.setting, reasons.intensity].filter(Boolean).join("; ");
  return { state: next, changed };
}

/** Extends a streak of agreeing results, or starts a new one. */
function bump<T>(streak: Streak<T> | undefined, value: T): Streak<T> {
  return streak?.value === value ? { value, count: streak.count + 1 } : { value, count: 1 };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

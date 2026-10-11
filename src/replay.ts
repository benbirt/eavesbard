// Replays a recorded transcript through the app in place of the microphone, so
// experiments can test the whole pipeline on real play: the director's
// 15-second scene checks, the local models, the state machine and the track
// picks all run as they do in a session (experiments/E13.md). Only with
// ?replay in the page's address; the page is otherwise unchanged.

import { allowDownloads } from "./downloads.js";
import { checking, scene, setSceneYourself, startSession, stopSession } from "./director.js";
import type { Intensity, Setting } from "./library/scenes.js";
import { replayLine, replaying } from "./listener.js";
import { prepareLocalModels, prepareTrackIndex } from "./local-models.js";
import { prepareSceneLlm } from "./llm/scene-llm.js";
import { timeline, type TimelineEntry } from "./timeline.js";

export interface ReplayApi {
  /** Downloads and loads the local models; resolves when all are ready. */
  prepare(): Promise<void>;
  start(): Promise<void>;
  stop(): void;
  /** A transcript line that started at `at` (ms since the epoch), just finished. */
  line(text: string, at: number, durationS: number): void;
  /** Sets the scene by hand, as the scene card does. */
  setScene(setting: Setting, intensity: Intensity): void;
  /** Whether a scene check is running, and the current scene. */
  state(): { checking: boolean; setting?: Setting; intensity?: Intensity };
  /** Timeline entries from `from` on. */
  timeline(from: number): TimelineEntry[];
}

declare global {
  interface Window {
    eavesbardReplay?: ReplayApi;
  }
}

if (replaying) {
  window.eavesbardReplay = {
    async prepare() {
      allowDownloads();
      await Promise.all([prepareLocalModels(), prepareTrackIndex(), prepareSceneLlm()]);
    },
    start: startSession,
    stop: stopSession,
    line: replayLine,
    setScene: (setting, intensity) => setSceneYourself({ setting, intensity }),
    state: () => ({ checking: checking.value, setting: scene.value?.setting, intensity: scene.value?.intensity }),
    timeline: (from) => timeline.value.slice(from),
  };
}

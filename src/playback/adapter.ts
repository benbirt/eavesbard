export interface PlaybackEvent {
  type: "playing" | "ended" | "error" | "info";
  detail: string;
}

export type PlaybackListener = (event: PlaybackEvent) => void;

/** One output device. Implementations: LocalAdapter and CastAdapter. */
export interface PlaybackAdapter {
  /** Start playing `url`, fading over `fadeMs` from whatever is playing now. */
  play(url: string, title: string, fadeMs: number): Promise<void>;
  stop(fadeMs: number): Promise<void>;
  /** Overall output level, 0 to 1. */
  setVolume(level: number): void;
  /** Pause or resume the current track. */
  setPaused(paused: boolean): void;
  /** Seek to `seconds` into the current track. */
  seekTo(seconds: number): void;
  onEvent(listener: PlaybackListener): void;
  /** Where the current track is, in seconds, if known. */
  position(): { currentS: number; durationS: number } | undefined;
}

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
  /** Seek to `secondsBeforeEnd` before the end of the current track (for testing track-end events). */
  seekNearEnd(secondsBeforeEnd: number): void;
  onEvent(listener: PlaybackListener): void;
}

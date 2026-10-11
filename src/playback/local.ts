import type { PlaybackAdapter, PlaybackListener } from "./adapter.js";
import { crossfadeGains, ramp } from "./fade.js";

/**
 * Plays through the laptop's own output using two plain audio elements,
 * crossfading by ramping each element's volume.
 *
 * The elements must never set `crossOrigin` (and so can't be routed through
 * Web Audio): the audio host refuses requests that carry an Origin header.
 */
export class LocalAdapter implements PlaybackAdapter {
  private readonly elements: [HTMLAudioElement, HTMLAudioElement];
  private active = 0;
  private level = 1;
  private fadeGeneration = 0;
  /** Bumped by each play(), so a late failure can't undo a newer request. */
  private playGeneration = 0;
  private readonly listeners: PlaybackListener[] = [];

  constructor() {
    this.elements = [new Audio(), new Audio()];
    for (const el of this.elements) {
      el.preload = "auto";
      el.addEventListener("playing", () => {
        if (this.isActive(el)) this.emit("playing", el.currentSrc);
      });
      el.addEventListener("waiting", () => {
        if (this.isActive(el)) this.emit("waiting", el.currentSrc);
      });
      el.addEventListener("ended", () => {
        if (this.isActive(el)) this.emit("ended", el.currentSrc);
      });
      el.addEventListener("error", () => {
        if (el.getAttribute("src")) {
          this.emit("error", `${el.currentSrc || el.src}: media error ${el.error?.code ?? "unknown"} ${el.error?.message ?? ""}`);
        }
      });
    }
  }

  async play(url: string, _title: string, fadeMs: number): Promise<void> {
    const generation = ++this.playGeneration;
    const outgoingIndex = this.active;
    const outgoing = this.elements[outgoingIndex]!;
    this.active = 1 - this.active;
    const incoming = this.elements[this.active]!;

    incoming.src = url;
    incoming.volume = 0;
    try {
      await incoming.play();
    } catch (err) {
      // Stopped or replaced before it started: not an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // It never started (e.g. the file is missing), so the outgoing track is still
      // the one playing: make it current again, so the next track fades it out rather
      // than taking over its element mid-play. (The element keeps its src, so its own
      // error event, which picks a replacement, still fires.)
      if (generation === this.playGeneration) {
        this.active = outgoingIndex;
        incoming.pause();
      }
      throw err;
    }
    await this.fade(fadeMs, (p) => {
      const g = crossfadeGains(p);
      outgoing.volume = g.out * this.level;
      incoming.volume = g.in * this.level;
    }, () => release(outgoing));
  }

  async stop(fadeMs: number): Promise<void> {
    const el = this.elements[this.active]!;
    const from = el.volume;
    await this.fade(fadeMs, (p) => (el.volume = from * (1 - p)), () => release(el));
  }

  setVolume(level: number): void {
    this.level = level;
    this.elements[this.active]!.volume = level;
  }

  setPaused(paused: boolean): void {
    const el = this.elements[this.active]!;
    if (!el.getAttribute("src")) return;
    if (paused) el.pause();
    else void el.play().catch(() => undefined);
  }

  seekTo(seconds: number): void {
    const el = this.elements[this.active]!;
    if (Number.isFinite(el.duration)) el.currentTime = Math.min(Math.max(0, seconds), el.duration);
  }

  position(): { currentS: number; durationS: number } | undefined {
    const el = this.elements[this.active]!;
    return el.getAttribute("src") && Number.isFinite(el.duration)
      ? { currentS: el.currentTime, durationS: el.duration }
      : undefined;
  }

  onEvent(listener: PlaybackListener): void {
    this.listeners.push(listener);
  }

  /** Runs a volume ramp, then `onDone`, unless a newer fade supersedes it. */
  private async fade(fadeMs: number, apply: (progress: number) => void, onDone: () => void): Promise<void> {
    const generation = ++this.fadeGeneration;
    const completed = await ramp(fadeMs, apply, () => generation !== this.fadeGeneration);
    if (completed) onDone();
  }

  private isActive(el: HTMLAudioElement): boolean {
    return el === this.elements[this.active];
  }

  private emit(type: "playing" | "waiting" | "ended" | "error", detail: string): void {
    for (const listener of this.listeners) listener({ type, detail });
  }
}

function release(el: HTMLAudioElement): void {
  el.pause();
  el.removeAttribute("src");
  el.load();
}

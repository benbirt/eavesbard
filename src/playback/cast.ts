import type { PlaybackAdapter, PlaybackListener } from "./adapter.js";

const SDK_URL = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

let sdkPromise: Promise<boolean> | undefined;

/** Loads the Cast sender SDK once. Resolves to whether casting is available. */
export function loadCastSdk(): Promise<boolean> {
  sdkPromise ??= new Promise((resolve) => {
    window.__onGCastApiAvailable = (isAvailable) => resolve(isAvailable);
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.onerror = () => resolve(false);
    document.head.append(script);
  });
  return sdkPromise;
}

/**
 * Plays through a Cast device using the Default Media Receiver.
 *
 * The Cast session itself is started by the user via the
 * `<google-cast-launcher>` button. Fade-and-swap transitions (section 7.8)
 * come with experiment E7; for now tracks swap immediately.
 */
export class CastAdapter implements PlaybackAdapter {
  private readonly player = new cast.framework.RemotePlayer();
  private readonly controller = new cast.framework.RemotePlayerController(this.player);
  private readonly listeners: PlaybackListener[] = [];

  constructor() {
    const context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (e) =>
      this.emit("info", `Cast session ${e.sessionState.toLowerCase()}`),
    );
    context.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, (e) =>
      this.emit("info", `Cast state: ${describeCastState(e.castState)}`),
    );
    this.controller.addEventListener(cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED, () => {
      const state = this.player.playerState;
      if (state === "PLAYING") {
        this.emit("playing", "receiver is playing");
      } else if (state === "IDLE") {
        const reason = context.getCurrentSession()?.getMediaSession()?.idleReason;
        if (reason === chrome.cast.media.IdleReason.FINISHED) this.emit("ended", "receiver finished the track");
        else if (reason === chrome.cast.media.IdleReason.ERROR) this.emit("error", "receiver failed to play the track");
        else this.emit("info", `receiver idle (${reason ?? "no reason given"})`);
      } else if (state) {
        this.emit("info", `receiver ${state.toLowerCase()}`);
      }
    });
  }

  /** The SDK's view of the network, e.g. whether it has found any devices. */
  castState(): string {
    return describeCastState(cast.framework.CastContext.getInstance().getCastState());
  }

  /** Whether discovery has found no Cast devices at all. */
  hasNoDevices(): boolean {
    return cast.framework.CastContext.getInstance().getCastState() === "NO_DEVICES_AVAILABLE";
  }

  /** Opens the browser's device chooser directly, without the Cast icon. */
  async connect(): Promise<void> {
    try {
      await cast.framework.CastContext.getInstance().requestSession();
    } catch (code) {
      throw new Error(`Couldn't start a Cast session (${String(code)})`);
    }
  }

  async play(url: string, title: string, _fadeMs: number): Promise<void> {
    const session = cast.framework.CastContext.getInstance().getCurrentSession();
    if (!session) throw new Error("No Cast session: use the Cast button first");

    // The audio host sends the non-standard audio/mp3, so state the type.
    const media = new chrome.cast.media.MediaInfo(url, "audio/mpeg");
    media.contentUrl = url;
    media.streamType = chrome.cast.media.StreamType.BUFFERED;
    const metadata = new chrome.cast.media.MusicTrackMediaMetadata();
    metadata.title = title;
    metadata.artist = "Tabletop Audio";
    media.metadata = metadata;

    const request = new chrome.cast.media.LoadRequest(media);
    request.autoplay = true;
    const error = await session.loadMedia(request);
    if (error) throw new Error(`Cast load failed: ${error}`);
    this.emit("info", `loaded on ${session.getCastDevice().friendlyName}`);
  }

  async stop(_fadeMs: number): Promise<void> {
    if (this.player.isConnected) this.controller.stop();
  }

  setVolume(level: number): void {
    // Device volume; see the caveat in section 7.8.
    this.player.volumeLevel = level;
    this.controller.setVolumeLevel();
  }

  seekNearEnd(secondsBeforeEnd: number): void {
    if (this.player.duration > 0) {
      this.player.currentTime = Math.max(0, this.player.duration - secondsBeforeEnd);
      this.controller.seek();
    }
  }

  onEvent(listener: PlaybackListener): void {
    this.listeners.push(listener);
  }

  private emit(type: "playing" | "ended" | "error" | "info", detail: string): void {
    for (const listener of this.listeners) listener({ type, detail });
  }
}

function describeCastState(state: cast.framework.CastState): string {
  switch (state) {
    case "NO_DEVICES_AVAILABLE":
      return "no Cast devices found on this network";
    case "NOT_CONNECTED":
      return "Cast devices found; not connected";
    case "CONNECTING":
      return "connecting";
    case "CONNECTED":
      return "connected";
    default:
      return String(state);
  }
}

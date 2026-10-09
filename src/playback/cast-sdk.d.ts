// Minimal declarations for the parts of the Google Cast Web Sender SDK (CAF)
// that we use. The SDK is loaded at runtime from gstatic.com, never bundled.

declare namespace chrome.cast {
  enum AutoJoinPolicy {
    ORIGIN_SCOPED = "origin_scoped",
  }
}

declare namespace chrome.cast.media {
  const DEFAULT_MEDIA_RECEIVER_APP_ID: string;

  enum StreamType {
    BUFFERED = "BUFFERED",
  }

  enum IdleReason {
    CANCELLED = "CANCELLED",
    INTERRUPTED = "INTERRUPTED",
    FINISHED = "FINISHED",
    ERROR = "ERROR",
  }

  class MusicTrackMediaMetadata {
    title?: string;
    artist?: string;
  }

  class MediaInfo {
    constructor(contentId: string, contentType: string);
    contentUrl?: string;
    streamType: StreamType;
    metadata: MusicTrackMediaMetadata | null;
  }

  class LoadRequest {
    constructor(mediaInfo: MediaInfo);
    autoplay: boolean;
  }

  interface Media {
    idleReason: IdleReason | null;
  }
}

declare namespace cast.framework {
  enum CastContextEventType {
    SESSION_STATE_CHANGED = "sessionstatechanged",
  }

  enum RemotePlayerEventType {
    PLAYER_STATE_CHANGED = "playerStateChanged",
  }

  interface SessionStateEventData {
    sessionState: string;
  }

  interface CastOptions {
    receiverApplicationId: string;
    autoJoinPolicy: chrome.cast.AutoJoinPolicy;
  }

  class CastContext {
    static getInstance(): CastContext;
    setOptions(options: CastOptions): void;
    getCurrentSession(): CastSession | null;
    addEventListener(type: CastContextEventType, handler: (event: SessionStateEventData) => void): void;
  }

  class CastSession {
    loadMedia(request: chrome.cast.media.LoadRequest): Promise<string | undefined>;
    getMediaSession(): chrome.cast.media.Media | null;
    getCastDevice(): { friendlyName: string };
  }

  class RemotePlayer {
    isConnected: boolean;
    playerState: string | null;
    currentTime: number;
    duration: number;
    volumeLevel: number;
  }

  class RemotePlayerController {
    constructor(player: RemotePlayer);
    addEventListener(type: RemotePlayerEventType, handler: () => void): void;
    seek(): void;
    stop(): void;
    setVolumeLevel(): void;
  }
}

interface Window {
  __onGCastApiAvailable?: (isAvailable: boolean) => void;
}

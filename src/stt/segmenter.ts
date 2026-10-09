// Turns a stream of audio frames and their speech probabilities (from the
// voice activity detector) into speech segments to transcribe. Pure logic,
// so it can be tested without audio or models.

export const SAMPLE_RATE = 16000;

export interface SegmenterOptions {
  /** A frame starts speech at or above this probability. */
  startThreshold: number;
  /** Once in speech, frames at or above this still count as speech. */
  continueThreshold: number;
  /** Silence that ends a segment. */
  minSilenceMs: number;
  /** Segments shorter than this (excluding padding) are dropped as noise. */
  minSpeechMs: number;
  /** Segments are cut at this length even mid-speech, so transcripts keep flowing. */
  maxSegmentMs: number;
  /** Audio kept before speech starts, so the first word isn't clipped. */
  padBeforeMs: number;
}

export const DEFAULT_SEGMENTER_OPTIONS: SegmenterOptions = {
  startThreshold: 0.5,
  continueThreshold: 0.35,
  minSilenceMs: 600,
  minSpeechMs: 250,
  maxSegmentMs: 15000,
  padBeforeMs: 300,
};

export interface Segment {
  audio: Float32Array;
  /** Seconds from the start of the stream. */
  start: number;
  end: number;
}

const samples = (ms: number) => Math.round((ms * SAMPLE_RATE) / 1000);

export class Segmenter {
  private readonly options: SegmenterOptions;
  /** Total samples seen so far: the stream position of the next frame. */
  private position = 0;
  /** Recent non-speech frames, kept as leading padding. */
  private before: Float32Array[] = [];
  private beforeSamples = 0;
  /** The segment being collected, if in speech. */
  private current: Float32Array[] = [];
  private currentStart = 0;
  private currentSamples = 0;
  private speechSamples = 0;
  private silentSamples = 0;

  constructor(options: Partial<SegmenterOptions> = {}) {
    this.options = { ...DEFAULT_SEGMENTER_OPTIONS, ...options };
  }

  get speaking(): boolean {
    return this.current.length > 0;
  }

  /** Feeds one frame. Returns a finished segment, if this frame completed one. */
  push(frame: Float32Array, probability: number): Segment | undefined {
    const o = this.options;
    const frameStart = this.position;
    this.position += frame.length;

    if (!this.speaking) {
      if (probability < o.startThreshold) {
        this.keepBefore(frame);
        return undefined;
      }
      this.current = [...this.before, frame];
      this.currentStart = frameStart - this.beforeSamples;
      this.currentSamples = this.beforeSamples + frame.length;
      this.speechSamples = frame.length;
      this.silentSamples = 0;
      this.before = [];
      this.beforeSamples = 0;
      return undefined;
    }

    this.current.push(frame);
    this.currentSamples += frame.length;
    if (probability >= o.continueThreshold) {
      this.speechSamples += frame.length + this.silentSamples;
      this.silentSamples = 0;
    } else {
      this.silentSamples += frame.length;
    }

    if (this.silentSamples >= samples(o.minSilenceMs) || this.currentSamples >= samples(o.maxSegmentMs)) {
      return this.finish();
    }
    return undefined;
  }

  /** Ends any segment in progress (e.g. when listening stops). */
  flush(): Segment | undefined {
    return this.speaking ? this.finish() : undefined;
  }

  private finish(): Segment | undefined {
    const long = this.speechSamples >= samples(this.options.minSpeechMs);
    const segment: Segment = {
      audio: concat(this.current, this.currentSamples),
      start: this.currentStart / SAMPLE_RATE,
      end: (this.currentStart + this.currentSamples) / SAMPLE_RATE,
    };
    this.current = [];
    this.currentSamples = 0;
    this.speechSamples = 0;
    this.silentSamples = 0;
    return long ? segment : undefined;
  }

  private keepBefore(frame: Float32Array): void {
    this.before.push(frame);
    this.beforeSamples += frame.length;
    const limit = samples(this.options.padBeforeMs);
    while (this.before.length > 1 && this.beforeSamples - this.before[0]!.length >= limit) {
      this.beforeSamples -= this.before.shift()!.length;
    }
  }
}

function concat(frames: Float32Array[], length: number): Float32Array {
  const out = new Float32Array(length);
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}

// The rolling window of recent transcript the classifier reads (DESIGN.md 7.3).

export interface TranscriptEntry {
  /** Milliseconds since the epoch when the speech started. */
  at: number;
  text: string;
}

export class TranscriptBuffer {
  private entries: TranscriptEntry[] = [];
  private fresh = false;

  constructor(private readonly windowMs = 150_000) {}

  add(entry: TranscriptEntry): void {
    this.entries.push(entry);
    this.fresh = true;
  }

  /** Entries within the window ending at `now`, oldest first. */
  window(now: number): TranscriptEntry[] {
    this.entries = this.entries.filter((e) => e.at >= now - this.windowMs);
    return [...this.entries];
  }

  /** Whether text has arrived since the last `markRead`. */
  get hasNewText(): boolean {
    return this.fresh;
  }

  markRead(): void {
    this.fresh = false;
  }

  clear(): void {
    this.entries = [];
    this.fresh = false;
  }
}

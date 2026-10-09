// Runs on the audio thread. Collects mono input into 512-sample frames (32 ms
// at 16 kHz, the frame size Silero VAD expects) and posts each to the page.

const FRAME_SAMPLES = 512;

class CaptureProcessor extends AudioWorkletProcessor {
  private frame = new Float32Array(FRAME_SAMPLES);
  private filled = 0;

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        this.frame[this.filled++] = channel[i]!;
        if (this.filled === FRAME_SAMPLES) {
          this.port.postMessage(this.frame, [this.frame.buffer]);
          this.frame = new Float32Array(FRAME_SAMPLES);
          this.filled = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("capture", CaptureProcessor);

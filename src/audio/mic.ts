import { assetUrl } from "../assets.js";
import { SAMPLE_RATE } from "../stt/segmenter.js";

export interface Mic {
  stop(): void;
}

/**
 * Captures the microphone as 16 kHz mono frames of 512 samples. Chrome
 * resamples from the device rate because the AudioContext runs at 16 kHz.
 */
export async function startMic(onFrame: (frame: Float32Array) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    // Experiment E6 settles these; echo cancellation helps when music plays through local speakers.
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    await context.audioWorklet.addModule(assetUrl("capture-worklet.js"));
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    await context.close();
    throw err;
  }
  const source = context.createMediaStreamSource(stream);
  // No outputs: the node only consumes audio, and Chrome still runs it.
  const node = new AudioWorkletNode(context, "capture", { numberOfInputs: 1, numberOfOutputs: 0 });
  node.port.onmessage = (e: MessageEvent<Float32Array>) => onFrame(e.data);
  source.connect(node);
  return {
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void context.close();
    },
  };
}

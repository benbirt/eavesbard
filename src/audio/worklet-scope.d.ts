// The parts of AudioWorkletGlobalScope that capture-worklet.ts uses, which
// TypeScript's DOM library doesn't declare.

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor & { process(inputs: Float32Array[][]): boolean },
): void;

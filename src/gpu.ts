// WebGPU checks shared by the page and the workers.

/** Whether the browser has WebGPU at all (it may still refuse an adapter). */
export const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;

/** The GPU adapter, or undefined if there isn't one. */
export async function gpuAdapter(): Promise<GPUAdapter | undefined> {
  return (await navigator.gpu?.requestAdapter().catch(() => null)) ?? undefined;
}

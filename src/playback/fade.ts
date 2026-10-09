/** Equal-power crossfade gains for `progress` in [0, 1]. */
export function crossfadeGains(progress: number): { out: number; in: number } {
  const p = Math.min(1, Math.max(0, progress));
  return { out: Math.cos((p * Math.PI) / 2), in: Math.sin((p * Math.PI) / 2) };
}

/**
 * Calls `onProgress` with values rising from 0 to 1 over `durationMs`, in
 * steps of `stepMs`. Stops early, without a final call, once `isCancelled`
 * returns true. Resolves to whether the ramp completed.
 */
export function ramp(
  durationMs: number,
  onProgress: (progress: number) => void,
  isCancelled: () => boolean = () => false,
  stepMs = 50,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (durationMs <= 0) {
      onProgress(1);
      resolve(true);
      return;
    }
    const start = performance.now();
    const tick = () => {
      if (isCancelled()) {
        resolve(false);
        return;
      }
      const progress = Math.min(1, (performance.now() - start) / durationMs);
      onProgress(progress);
      if (progress >= 1) resolve(true);
      else setTimeout(tick, stepMs);
    };
    tick();
  });
}

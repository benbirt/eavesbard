/**
 * Whether a recorded transcript is replayed instead of listening (src/replay.ts):
 * only with ?replay in the page's address, for experiments.
 */
export const replaying = typeof location !== "undefined" && new URLSearchParams(location.search).has("replay");

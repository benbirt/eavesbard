// Whisper invents text from noise, music and silence. These checks catch the
// common cases before they reach the transcript (DESIGN.md 7.2).

/** Phrases Whisper is known to produce from non-speech audio, normalised. */
const KNOWN_PHRASES = [
  "thank you",
  "thanks for watching",
  "thank you for watching",
  "thank you so much for watching",
  "please subscribe",
  "like and subscribe",
  "subtitles by the amara org community",
  "you",
  "bye",
  "so",
  "music",
  "applause",
  "laughter",
];

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns why `text` looks like a hallucination, or undefined if it looks like real speech. */
export function hallucinationReason(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return "empty";
  // Whole-segment annotations such as "[Music]", "(upbeat music)" or "♪♪".
  if (/^(\s*(\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|[♪♫]+))+\s*$/u.test(trimmed)) return "annotation";
  const plain = normalise(trimmed);
  if (!plain) return "no words";
  if (KNOWN_PHRASES.includes(plain)) return "known phrase";
  if (isRepetitive(plain)) return "repetition";
  return undefined;
}

/** True if most of the text is one short phrase repeated (e.g. "the the the the"). */
function isRepetitive(plain: string): boolean {
  const words = plain.split(" ");
  if (words.length < 6) return false;
  for (let size = 1; size <= 4; size++) {
    const counts = new Map<string, number>();
    for (let i = 0; i + size <= words.length; i += size) {
      const phrase = words.slice(i, i + size).join(" ");
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
    const top = Math.max(...counts.values());
    if (top >= 4 && (top * size) / words.length >= 0.7) return true;
  }
  return false;
}

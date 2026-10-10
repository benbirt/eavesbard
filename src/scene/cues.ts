// The one phrase that starts combat at once, without waiting for the next
// scene check (DESIGN.md 7.4). Questions about initiative don't count.

const ROLL_INITIATIVE = /\b(?:roll|rolls|rolled|rolling|role|roles)\s+(?:for\s+|your\s+|you're\s+|me\s+)?initiative\b/i;
const QUESTION_START = /^\s*(?:so\s+|wait\s+|um\s+|and\s+)?(?:how|what|why|when|who|which|do|does|did|should|shall|can|could|would|will|are|is)\b/i;

/** Whether `text` calls for initiative, as opposed to asking about it. */
export function callsForInitiative(text: string): boolean {
  // Sentences, keeping each one's closing punctuation.
  for (const sentence of text.match(/[^.!?]+[.!?]*/g) ?? []) {
    if (!ROLL_INITIATIVE.test(sentence)) continue;
    if (sentence.trimEnd().endsWith("?") || QUESTION_START.test(sentence)) continue;
    return true;
  }
  return false;
}

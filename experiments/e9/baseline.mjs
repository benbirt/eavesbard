// The current method: hand-written label descriptions ("L").
import { DEV, TEST, LC, embed, dot, lines, current, evaluate, QUERY_PREFIX } from "./common.mjs";
const docs = LC.labelDocs();
const vecs = await embed(docs.map((d) => d.text));
async function scores(text) {
  const [q] = await embed([QUERY_PREFIX + text]);
  return new Map(docs.map((d, i) => [d.key, dot(vecs[i], q)]));
}
export async function classifyL(s) {
  const ls = lines(s);
  const st = "description" in s.input ? s.input.description : LC.lastWords(ls, 150);
  const it = "description" in s.input ? s.input.description : LC.latest(ls);
  return LC.classifyFromScores(await scores(st), await scores(it), { intensity: current(s)?.intensity ?? "calm" });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  await evaluate("L: label descriptions — DEV", DEV, classifyL);
  await evaluate("L: label descriptions — TEST", TEST, classifyL, { verbose: process.argv.includes("-v") });
}

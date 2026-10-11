// Scoring of replay runs against the reference labels (experiments/E13.md),
// shared by score.mjs (a saved run) and sim.mjs (offline blends of one).
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Checks this soon after a label change aren't counted as steady: lag there is by design. */
export const INTENSITY_GRACE_S = 60;
/** A setting lasts at least three minutes in the app (DESIGN.md 7.6). */
export const SETTING_GRACE_S = 180;
/** Calling combat this long before a fight's labelled start counts as on time, not a false alarm. */
export const EARLY_S = 120;

const sec = (mss) => {
  const [m, s] = mss.split(":");
  return Number(m) * 60 + Number(s);
};
export const pct = (a, n) => (n ? `${Math.round((100 * a) / n)}%` : "–");
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : undefined;
};

/** The labels for a run's set ("bardo" or "crd3"), by episode. */
export function labelsFor(dir, set) {
  return JSON.parse(readFileSync(join(dir, set === "crd3" ? "labels-crd3.json" : "labels.json"), "utf8")).episodes;
}

/** Scores a run's episodes (or those in `only`). */
export function scoreRun(run, labels, only) {
  const total = { steadyI: 0, okI: 0, rawI: 0, steadyS: 0, okS: 0, rawS: 0, falseCombatS: 0, calmTenseS: 0, falseEntries: 0 };
  const confusion = {};
  const fights = [];
  const perEpisode = [];
  let llmChecks = 0;
  let allChecks = 0;
  const latencies = [];

  for (const [ep, data] of Object.entries(run.episodes)) {
    if (only && !only.has(ep)) continue;
    // "skip" stretches (pre-show, breaks) have no labels, and aren't scored.
    const stretches = labels[ep].map((s) => ({ intensity: [], setting: [], ...s, t: sec(s.from) }));
    stretches.forEach((s, i) => (s.end = stretches[i + 1]?.t ?? data.end));
    const at = (t) => stretches.filter((s) => s.t <= t).at(-1) ?? stretches[0];
    /** Seconds since the best intensity (or setting) last changed, at time t. */
    const since = (t, axis) => {
      const i = stretches.indexOf(at(t));
      let j = i;
      while (j > 0 && stretches[j - 1][axis][0] === stretches[i][axis][0]) j--;
      return t - stretches[j].t;
    };

    // Each scene check, with the scene the app was in once it had been decided.
    const checks = [];
    let scene;
    let pending;
    for (const e of data.events) {
      if (e.kind === "call" && e.purpose === "scene" && !e.error) {
        pending = { t: e.t, result: e.result };
        allChecks++;
        if (e.model?.includes("+")) llmChecks++;
        if (e.latencyMs) latencies.push(e.latencyMs);
      } else if (e.kind === "decision") {
        const entering = e.to.intensity === "combat" && e.from.intensity !== "combat";
        scene = e.to;
        if (pending) {
          checks.push({ ...pending, scene });
          if (entering) {
            // A false alarm: combat where no fight is labelled, nor starts soon.
            const fightSoon = stretches.some((s) => s.intensity[0] === "combat" && s.t >= e.t && s.t - e.t <= EARLY_S);
            if (!at(e.t).skip && !at(e.t).intensity.includes("combat") && !fightSoon) total.falseEntries++;
          }
          pending = undefined;
        }
      }
    }
    const step = 15; // Seconds per check, for time-weighting.

    const ep_ = { ep, steadyI: 0, okI: 0, steadyS: 0, okS: 0 };
    for (const c of checks) {
      const s = at(c.t);
      if (s.skip) continue;
      if (since(c.t, "intensity") >= INTENSITY_GRACE_S) {
        total.steadyI++;
        ep_.steadyI++;
        if (s.intensity.includes(c.scene.intensity)) total.okI++, ep_.okI++;
        if (s.intensity.includes(c.result.intensity)) total.rawI++;
        const k = `${s.intensity[0]}→${c.scene.intensity}`;
        confusion[k] = (confusion[k] ?? 0) + 1;
      }
      if (since(c.t, "setting") >= SETTING_GRACE_S) {
        total.steadyS++;
        ep_.steadyS++;
        if (s.setting.includes(c.scene.setting)) total.okS++, ep_.okS++;
        if (s.setting.includes(c.result.setting)) total.rawS++;
      }
      if (!s.intensity.includes("combat") && since(c.t, "intensity") >= INTENSITY_GRACE_S) {
        total.calmTenseS += step;
        if (c.scene.intensity === "combat") total.falseCombatS += step;
      }
    }
    perEpisode.push(ep_);

    // Fights: stretches whose best label is combat, merged when back to back.
    for (let i = 0; i < stretches.length; i++) {
      if (stretches[i].intensity[0] !== "combat" || stretches[i - 1]?.intensity[0] === "combat") continue;
      let j = i;
      while (stretches[j + 1]?.intensity[0] === "combat") j++;
      const start = stretches[i].t;
      const end = stretches[j].end;
      const nextFight = stretches.slice(j + 1).find((s) => s.intensity[0] === "combat")?.t ?? data.end;
      const hit = checks.find((c) => c.t >= start - EARLY_S && c.t < end && c.scene.intensity === "combat");
      const left = end < data.end ? checks.find((c) => c.t >= end && c.t < nextFight && c.scene.intensity !== "combat") : undefined;
      fights.push({
        ep,
        start,
        length: end - start,
        called: hit ? Math.max(0, hit.t - start) : undefined,
        left: end >= data.end ? "episode ends" : left ? left.t - end : undefined,
      });
    }
  }
  const s = summary({ total, confusion, fights, perEpisode, llmChecks, allChecks, latencies });
  return s;
}

/** Headline figures from a score. */
function summary(m) {
  const { total, fights, confusion } = m;
  const called = fights.filter((f) => f.called !== undefined);
  const endable = fights.filter((f) => f.left !== "episode ends");
  const lefts = fights.filter((f) => typeof f.left === "number");
  const k = (a, b) => confusion[`${a}→${b}`] ?? 0;
  const row = (a) => ["calm", "tense", "combat"].reduce((n, b) => n + k(a, b), 0);
  return {
    ...m,
    intensity: total.steadyI ? total.okI / total.steadyI : 0,
    setting: total.steadyS ? total.okS / total.steadyS : 0,
    calm: row("calm") ? k("calm", "calm") / row("calm") : 0,
    tense: row("tense") ? k("tense", "tense") / row("tense") : 0,
    combat: row("combat") ? k("combat", "combat") / row("combat") : 0,
    combatDropped: row("combat") ? k("combat", "calm") / row("combat") : 0,
    fightsCalled: fights.length ? called.length / fights.length : 0,
    fightsLeft: endable.length ? lefts.length / endable.length : 0,
    callLag: median(called.map((f) => f.called)) ?? 0,
    leaveLag: median(lefts.map((f) => f.left)) ?? 0,
    falseCombat: total.calmTenseS ? total.falseCombatS / total.calmTenseS : 0,
  };
}

/** Prints a score in full. */
export function printReport(run, m) {
  const { total, confusion, fights, perEpisode } = m;
  console.log(`${run.name}: ${m.allChecks} scene checks, ${pct(m.llmChecks, m.allChecks)} with the scene LLM, median ${median(m.latencies)} ms per check (${run.gpu})`);
  console.log("");
  console.log(`Away from changes (intensity ${INTENSITY_GRACE_S} s, setting ${SETTING_GRACE_S} s after a labelled change):`);
  console.log(`  intensity: ${pct(total.okI, total.steadyI)} of ${total.steadyI} checks (classifier alone ${pct(total.rawI, total.steadyI)})`);
  console.log(`  setting:   ${pct(total.okS, total.steadyS)} of ${total.steadyS} checks (classifier alone ${pct(total.rawS, total.steadyS)})`);
  console.log(`  combat in calm or tense play: ${pct(total.falseCombatS, total.calmTenseS)} of the time; ${total.falseEntries} false starts in ${(total.calmTenseS / 3600).toFixed(1)} h`);
  console.log("  labelled → app:", Object.entries(confusion).sort().map(([k, v]) => `${k} ${v}`).join(", "));
  console.log("");
  const called = fights.filter((f) => f.called !== undefined);
  const lefts = fights.filter((f) => typeof f.left === "number");
  console.log(`Fights: ${called.length} of ${fights.length} called, median ${median(called.map((f) => f.called))} s after the labelled start`);
  console.log(`  left combat after the fight: ${lefts.length} of ${fights.filter((f) => f.left !== "episode ends").length}, median ${median(lefts.map((f) => f.left))} s after`);
  for (const f of fights) {
    const c = f.called === undefined ? "missed" : `called after ${Math.round(f.called)} s`;
    const l = f.left === "episode ends" ? "" : typeof f.left === "number" ? `, left ${Math.round(f.left)} s after` : ", never left before the next fight or the end";
    console.log(`  episode ${f.ep} ${fmt(f.start)} (${fmt(f.length)} long): ${c}${l}`);
  }
  console.log("");
  console.log("By episode (intensity, setting, away from changes):");
  for (const e of perEpisode) console.log(`  ${e.ep}: ${pct(e.okI, e.steadyI)}, ${pct(e.okS, e.steadyS)}`);
}

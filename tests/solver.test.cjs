/* CUTLINE solver tests — run with `npm test`. No dependencies. */
const assert = require("assert");
const Solver = require("../js/solver.js");
const data = require("../data/scenes.json");
const SCENES = data.scenes;
const byId = Object.fromEntries(SCENES.map((s) => [s.id, s]));
const dur = (ids) => ids.reduce((t, id) => t + (byId[id].end - byId[id].start), 0);
let n = 0;
const ok = (cond, msg) => { n++; assert(cond, msg); console.log("ok " + n + " - " + msg); };

// 1. Scene index integrity: contiguous, 28 scenes, 52:14 total.
assert(SCENES.length >= 20 && SCENES.length <= 40, "20-40 scenes");
for (let i = 1; i < SCENES.length; i++)
  assert(SCENES[i].start === SCENES[i - 1].end, "contiguous at " + SCENES[i].id);
const total = SCENES[SCENES.length - 1].end - SCENES[0].start;
ok(total === 3134, "episode total is 3134s = 52:14");

// 2. Budgets are hard constraints + ordered + deterministic.
for (const b of [300, 600, 900, 1800]) {
  const r1 = Solver.buildRoute(SCENES, b, {});
  const r2 = Solver.buildRoute(SCENES, b, {});
  ok(r1.totalDuration <= b, b + "s budget respected (" + r1.totalDuration + "s)");
  ok(JSON.stringify(r1.ids) === JSON.stringify(r2.ids), b + "s route deterministic");
  const starts = r1.scenes.map((s) => s.start);
  ok(starts.every((v, i) => i === 0 || v > starts[i - 1]), b + "s narrative order preserved");
  // dependency closure
  const set = new Set(r1.ids);
  r1.scenes.forEach((s) =>
    (s.required_after || []).forEach((d) => assert(set.has(d), s.id + " requires " + d))
  );
  ok(true, b + "s dependency closure holds (" + r1.ids.length + " scenes)");
}

// 3. Anchor beats: the reveal always survives; discovery/confrontation
//    functions are covered; small budgets stay full (no stranded time).
{
  const r300 = Solver.buildRoute(SCENES, 300, {});
  ok(r300.ids.includes("s18"), "5-min essentials keeps the Boathouse Reveal");
  ok(r300.ids.includes("s10"), "5-min essentials keeps its setup (Mudflat Clue)");
  ok(r300.totalDuration / 300 >= 0.8, "5-min fill >= 80% (" + r300.totalDuration + "s)");
  const r900 = Solver.buildRoute(SCENES, 900, {});
  ok(r900.ids.includes("s18"), "15-min story keeps the Boathouse Reveal");
  const hasDiscovery = r900.scenes.some((s) =>
    ["s05", "s09", "s10", "s14"].includes(s.id));
  const hasConfront = r900.scenes.some((s) => s.plot.includes("confrontation"));
  ok(hasDiscovery, "15-min story covers the discovery function");
  ok(hasConfront, "15-min story covers the confrontation function");
  ok(r900.totalDuration / 900 >= 0.9, "15-min fill >= 90% (" + r900.totalDuration + "s)");
  const r1800 = Solver.buildRoute(SCENES, 1800, {});
  ok(r1800.ids.includes("s24"), "30-min cut reaches the Resolution");
  ok(r1800.totalDuration / 1800 >= 0.9, "30-min fill >= 90% (" + r1800.totalDuration + "s)");
}

// 4. Thread lens actually re-centers the route.
{
  const r = Solver.buildRoute(SCENES, 900, { thread: "mystery" });
  const frac = r.scenes.filter((s) => s.threads.includes("mystery")).length / r.scenes.length;
  ok(frac >= 0.6, "mystery lens: " + Math.round(frac * 100) + "% mystery scenes");
}

// 5. Kids-safe route drops all non-family scenes.
{
  const r = Solver.buildRoute(SCENES, 900, { kidsOnly: true });
  ok(r.scenes.every((s) => s.familySafe), "kids-safe route is fully family-safe");
}

// 6. Re-entry catch-up only moves forward from the stop point.
{
  const r = Solver.buildRoute(SCENES, 480, { afterSec: 1390 });
  ok(r.scenes.every((s) => s.start >= 1390 || s.id === r.bridgeId), "catch-up moves forward from 23:10");
  ok(r.totalDuration <= 480, "catch-up fits 8 min (" + r.totalDuration + "s)");
}

// 7. NL parser covers the demo utterances.
{
  const p1 = Solver.parseRequest("I only have 10 minutes, intense version");
  ok(p1.budgetMin === 10 && p1.mood === "intense", "parses budget + mood");
  ok(Solver.parseRequest("Only the mystery thread").thread === "mystery", "parses thread");
  ok(Solver.parseRequest("Kids have 8 minutes").kidsOnly, "parses kids-safe");
  const p4 = Solver.parseRequest("I stopped at 23:10 yesterday, catch me up in 8 minutes");
  ok(p4.afterSec === 1390 && p4.budgetMin === 8, "parses re-entry point + budget");
}

// 8. Time morphs monotonically: more budget never yields a shorter cut.
{
  let prev = -1;
  for (const m of [5, 10, 15, 20, 30, 45]) {
    const r = Solver.buildRoute(SCENES, m * 60, {});
    assert(r.totalDuration >= prev, "monotonic at " + m + " min");
    prev = r.totalDuration;
  }
  ok(true, "time morphing is monotonic 5→45 min");
}

// 9. Player mapping math: episode<->video proportional mapping is invertible.
{
  const Player = require("../js/player.js");
  const fake = { duration: 596, addEventListener() {} };
  const pl = new Player(fake, { episodeDuration: 3134 });
  const v = pl.mapToVideo(1567);
  ok(Math.abs(pl.mapToEpisode(v) - 1567) < 1e-6, "episode<->video mapping round-trips");
}

console.log("\nAll " + n + " checks passed.");

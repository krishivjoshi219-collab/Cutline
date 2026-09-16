export type Thread = "all" | "mystery" | "heart" | "chase";
export interface Scene {
  id: string; start: number; end: number; title: string;
  synopsis: string; threads: string[]; plot: string[];
  importance: number; intensity: number; familySafe: boolean;
  required_after?: string[];
}
export interface Route { scenes: Scene[]; ids: string[]; totalDuration: number; totalScore: number; budgetSec: number; coverage: number; bridgeId: string | null; }

const IMPORTANCE_WEIGHT = 100;
const PLOT_BONUS: Record<string, number> = { reveal: 12, resolution: 10, confrontation: 8, discovery: 6, twist: 5 };

export function duration(s: Scene): number { return Math.max(0, s.end - s.start); }

export function scoreScene(s: Scene, opts: { thread?: Thread; mood?: string | null } = {}): number {
  let score = (s.importance || 0) * IMPORTANCE_WEIGHT;
  if (s.plot.includes("reveal")) score += PLOT_BONUS.reveal;
  if (s.plot.includes("resolution")) score += PLOT_BONUS.resolution;
  if (s.plot.includes("confrontation")) score += PLOT_BONUS.confrontation;
  if (s.plot.includes("discovery")) score += PLOT_BONUS.discovery;
  if (s.plot.includes("twist")) score += PLOT_BONUS.twist;
  if (opts.thread && opts.thread !== "all") {
    if (s.threads.includes(opts.thread)) score += 30;
    else score *= 0.45;
  }
  if (opts.mood === "intense") score += (s.intensity || 3) * 3;
  return score;
}

function closeDeps(ids: string[], byId: Record<string, Scene>, skip?: (d: string) => boolean): string[] {
  const closed: Record<string, boolean> = {};
  ids.forEach((id) => { if (byId[id]) closed[id] = true; });
  let changed = true, guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    Object.keys(closed).forEach((id) => {
      (byId[id].required_after || []).forEach((dep) => {
        if (skip && skip(dep)) return;
        if (byId[dep] && !closed[dep]) { closed[dep] = true; changed = true; }
      });
    });
  }
  return Object.keys(closed);
}

export function buildRoute(scenes: Scene[], budgetSec: number, opts: { thread?: Thread; mood?: string | null; kidsOnly?: boolean; afterSec?: number | null; excludeIds?: string[] } = {}): Route {
  const clean = scenes.filter((s) => s.id != null && s.end > s.start);
  const B = Math.max(0, Math.floor(budgetSec || 0));
  const byId: Record<string, Scene> = {};
  clean.forEach((s) => { byId[s.id] = s; });
  if (!clean.length) return { scenes: [], ids: [], totalDuration: 0, totalScore: 0, budgetSec: B, coverage: 0, bridgeId: null };
  let pool = clean.filter((s) => {
    if (opts.kidsOnly && !s.familySafe) return false;
    if (opts.excludeIds && opts.excludeIds.includes(s.id)) return false;
    return true;
  });
  let bridgeId: string | null = null;
  if (typeof opts.afterSec === "number") {
    let prior: Scene | null = null;
    pool.forEach((s) => { if (s.start < (opts.afterSec as number) && (!prior || s.start > prior.start)) prior = s; });
    if (prior) bridgeId = prior.id;
    pool = pool.filter((s) => s.id === bridgeId || s.start >= (opts.afterSec as number));
  }
  const skip = typeof opts.afterSec === "number"
    ? (dep: string) => dep !== bridgeId && !!byId[dep] && byId[dep].end <= (opts.afterSec as number)
    : undefined;
  const scores: Record<string, number> = {};
  pool.forEach((s) => { scores[s.id] = scoreScene(s, opts); });
  const dp = new Array(B + 1).fill(0);
  const pick: string[][] = new Array(B + 1).fill(null).map(() => []);
  pool.forEach((s) => {
    const w = duration(s), v = scores[s.id];
    for (let c = B; c >= w; c--) {
      const alt = dp[c - w] + v;
      if (alt > dp[c] + 1e-9) { dp[c] = alt; pick[c] = [...pick[c - w], s.id]; }
    }
  });
  let best = 0;
  for (let c = 0; c <= B; c++) if (dp[c] > dp[best]) best = c;
  let chosen = closeDeps(pick[best], byId, skip);
  const sumDur = (ids: string[]) => ids.reduce((t, id) => t + duration(byId[id]), 0);
  let guard = 0;
  while (sumDur(chosen) > B && chosen.length && guard++ < 100) {
    const required: Record<string, boolean> = {};
    chosen.forEach((id) => (byId[id].required_after || []).forEach((d) => { required[d] = true; }));
    let drop = chosen.filter((id) => !required[id] && id !== bridgeId);
    if (!drop.length) drop = chosen.filter((id) => id !== bridgeId);
    if (!drop.length) break;
    drop.sort((a, b) => scores[a] / duration(byId[a]) - scores[b] / duration(byId[b]));
    chosen = closeDeps(chosen.filter((id) => id !== drop[0]), byId, skip);
  }
  chosen.sort((a, b) => byId[a].start - byId[b].start);
  const route = chosen.map((id) => byId[id]);
  const total = sumDur(chosen);
  const full = clean[clean.length - 1].end - clean[0].start;
  return { scenes: route, ids: chosen.slice(), totalDuration: total, totalScore: chosen.reduce((t, id) => t + scores[id], 0), budgetSec: B, coverage: full ? total / full : 0, bridgeId };
}

export function fmt(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}
export function fmtRange(s: Scene): string { return fmt(s.start) + "–" + fmt(s.end); }

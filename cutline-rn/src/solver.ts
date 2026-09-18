export type Thread = "all" | "mystery" | "heart" | "chase";

export interface Scene {
  id: string;
  start: number;
  end: number;
  title: string;
  synopsis: string;
  threads: string[];
  plot: string[];
  importance: number;
  intensity: number;
  familySafe: boolean;
  required_after?: string[];
}

export interface Route {
  scenes: Scene[];
  ids: string[];
  totalDuration: number;
  totalScore: number;
  budgetSec: number;
  coverage: number;
  bridgeId: string | null;
}

export interface SolverOptions {
  thread?: Thread;
  mood?: string | null;
  kidsOnly?: boolean;
  afterSec?: number | null;
  excludeIds?: string[];
}

export interface ParsedRequest {
  budgetMin: number | null;
  thread: Thread;
  mood: "intense" | "gentle" | null;
  kidsOnly: boolean;
  afterSec: number | null;
}

const IMPORTANCE_WEIGHT = 100;
const PLOT_BONUS: Record<string, number> = {
  reveal: 12,
  resolution: 10,
  confrontation: 8,
  discovery: 6,
  twist: 5,
};
const THREAD_MATCH_BONUS = 30;
const THREAD_MISMATCH_SCALE = 0.45;
const MAX_BUDGET_SEC = 6 * 60 * 60;
const MIN_FILL_SEC = 25;
const EPS = 1e-9;
const VALID_THREADS: Record<string, boolean> = { all: true, mystery: true, heart: true, chase: true };

export function duration(s: Scene | null | undefined): number {
  if (!s) return 0;
  const st = Number(s.start);
  const en = Number(s.end);
  if (!Number.isFinite(st) || !Number.isFinite(en)) return 0;
  return Math.max(0, en - st);
}

function asArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

export function scoreScene(s: Scene, opts: SolverOptions = {}): number {
  if (!s) return 0;
  const plot = asArray(s.plot);
  const threads = asArray(s.threads);
  const importance = Number.isFinite(s.importance) ? s.importance : 0;
  const intensity = Number.isFinite(s.intensity) ? s.intensity : 3;

  let score = importance * IMPORTANCE_WEIGHT;
  if (plot.includes("reveal")) score += PLOT_BONUS.reveal;
  if (plot.includes("resolution")) score += PLOT_BONUS.resolution;
  if (plot.includes("confrontation")) score += PLOT_BONUS.confrontation;
  if (plot.includes("discovery")) score += PLOT_BONUS.discovery;
  if (plot.includes("twist")) score += PLOT_BONUS.twist;

  if (opts.thread && opts.thread !== "all") {
    if (threads.includes(opts.thread)) score += THREAD_MATCH_BONUS;
    else score *= THREAD_MISMATCH_SCALE;
  }

  if (opts.mood === "intense") score += intensity * 3;
  if (opts.mood === "gentle") score += (6 - intensity) * 3;

  return score;
}

function closeDependencies(
  ids: string[],
  byId: Record<string, Scene>,
  skipDep?: ((dep: string) => boolean) | null
): string[] {
  const closed: Record<string, boolean> = {};
  asArray(ids).forEach((id) => {
    if (byId[id]) closed[id] = true;
  });

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    Object.keys(closed).forEach((id) => {
      const scene = byId[id];
      if (!scene) return;
      asArray(scene.required_after).forEach((dep) => {
        if (skipDep && skipDep(dep)) return;
        if (byId[dep] && !closed[dep]) {
          closed[dep] = true;
          changed = true;
        }
      });
    });
  }

  return Object.keys(closed);
}

function sumDuration(ids: string[], byId: Record<string, Scene>): number {
  return asArray(ids).reduce((t, id) => t + duration(byId[id]), 0);
}

function sumScore(ids: string[], byId: Record<string, Scene>, scores: Record<string, number>): number {
  return asArray(ids).reduce((t, id) => t + (Number.isFinite(scores[id]) ? scores[id] : 0), 0);
}

export function buildRoute(scenes: Scene[], budgetSec: number, opts: SolverOptions = {}): Route {
  const options: SolverOptions = { ...opts };
  if (options.thread && !VALID_THREADS[options.thread]) options.thread = "all";
  if (options.mood !== "intense" && options.mood !== "gentle") options.mood = null;

  const clean = asArray(scenes).filter(
    (s) => s && s.id != null && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start
  );

  let B = Math.max(0, Math.floor(Number.isFinite(budgetSec) ? budgetSec : 0));
  if (B > MAX_BUDGET_SEC) B = MAX_BUDGET_SEC;

  if (!clean.length) {
    return { scenes: [], ids: [], totalDuration: 0, totalScore: 0, budgetSec: B, coverage: 0, bridgeId: null };
  }

  const byId: Record<string, Scene> = {};
  clean.forEach((s) => {
    byId[s.id] = s;
  });

  let pool = clean.filter((s) => {
    if (options.kidsOnly && !s.familySafe) return false;
    if (options.excludeIds && options.excludeIds.includes(s.id)) return false;
    return true;
  });

  let bridgeId: string | null = null;
  if (typeof options.afterSec === "number") {
    let prior: Scene | null = null;
    pool.forEach((s) => {
      if (s.start < (options.afterSec as number) && (!prior || s.start > prior.start)) prior = s;
    });
    if (prior) bridgeId = (prior as Scene).id;
    pool = pool.filter((s) => s.id === bridgeId || s.start >= (options.afterSec as number));
  }

  const skipDep =
    typeof options.afterSec === "number"
      ? (dep: string) => dep !== bridgeId && !!byId[dep] && byId[dep].end <= (options.afterSec as number)
      : null;

  const scores: Record<string, number> = {};
  pool.forEach((s) => {
    scores[s.id] = scoreScene(s, options);
  });

  const dp = new Array(B + 1).fill(0);
  const pick: string[][] = new Array(B + 1).fill(null).map(() => []);
  pool.forEach((s) => {
    const w = duration(s);
    const v = scores[s.id];
    for (let c = B; c >= w; c--) {
      const alt = dp[c - w] + v;
      if (alt > dp[c] + EPS) {
        dp[c] = alt;
        pick[c] = pick[c - w].concat(s.id);
      }
    }
  });

  let best = 0;
  for (let c = 0; c <= B; c++) {
    if (dp[c] > dp[best] + EPS) best = c;
  }

  let chosen = closeDependencies(pick[best], byId, skipDep);

  let guard = 0;
  while (sumDuration(chosen, byId) > B && chosen.length && guard++ < 100) {
    const required: Record<string, boolean> = {};
    chosen.forEach((id) => {
      (byId[id].required_after || []).forEach((d) => {
        required[d] = true;
      });
    });

    let droppable = chosen.filter((id) => !required[id] && id !== bridgeId);
    if (!droppable.length) droppable = chosen.filter((id) => id !== bridgeId);
    if (!droppable.length) break;

    droppable.sort((a, b) => {
      const da = scores[a] / duration(byId[a]);
      const db = scores[b] / duration(byId[b]);
      if (da !== db) return da - db;
      return byId[a].start - byId[b].start;
    });

    const out = droppable[0];
    chosen = closeDependencies(
      chosen.filter((id) => id !== out),
      byId,
      skipDep
    );
  }

  chosen.sort((a, b) => byId[a].start - byId[b].start);

  // Anchor enforcement (budgets <= 10 min): reveal/resolution must survive
  if (B <= 600) {
    const hasPayoff = chosen.some((id) => {
      const p = asArray(byId[id].plot);
      return p.includes("reveal") || p.includes("resolution");
    });

    if (!hasPayoff) {
      const cands = pool.filter((s) => {
        const plot = asArray(s.plot);
        const isPayoff = plot.includes("reveal") || plot.includes("resolution");
        if (!isPayoff) return false;
        if (options.thread && options.thread !== "all" && !asArray(s.threads).includes(options.thread)) return false;
        if (options.kidsOnly && !s.familySafe) return false;
        return true;
      });

      cands.sort((a, b) => {
        if (scores[b.id] !== scores[a.id]) return scores[b.id] - scores[a.id];
        return a.start - b.start;
      });

      for (let i = 0; i < cands.length; i++) {
        const need = closeDependencies([cands[i].id], byId, skipDep);
        const w = sumDuration(need, byId);
        if (w > B) continue;

        const evictable = chosen.filter((id) => id !== bridgeId);
        evictable.sort((a, b) => {
          const da = scores[a] / duration(byId[a]);
          const db = scores[b] / duration(byId[b]);
          if (da !== db) return da - db;
          return byId[a].start - byId[b].start;
        });

        let kept = chosen.slice();
        while (
          sumDuration(
            closeDependencies(
              kept.concat(need.filter((id) => !kept.includes(id))),
              byId,
              skipDep
            ),
            byId
          ) > B &&
          evictable.length
        ) {
          const out = evictable.shift()!;
          kept = kept.filter((id) => id !== out);
        }

        chosen = closeDependencies(kept.concat(need), byId, skipDep);
        if (sumDuration(chosen, byId) <= B) break;
      }
    }
  }

  // Fill pass: greedily add best-density closure that still fits
  const routeAvg = chosen.length ? sumScore(chosen, byId, scores) / sumDuration(chosen, byId) : 0;
  let fillGuard = 0;
  while (fillGuard++ < 100) {
    const remaining = B - sumDuration(chosen, byId);
    if (remaining < MIN_FILL_SEC) break;

    const inRoute: Record<string, boolean> = {};
    chosen.forEach((id) => {
      inRoute[id] = true;
    });

    let bestId: string | null = null;
    let bestDens = -1;

    pool.forEach((s) => {
      if (inRoute[s.id]) return;
      const closure = closeDependencies([s.id], byId, skipDep).filter((id) => !inRoute[id]);
      const w = sumDuration(closure, byId);
      if (w > remaining || w <= 0) return;
      const v = sumScore(closure, byId, scores);
      const qualityGate = chosen.length < 3 || v / w >= routeAvg * 0.5;
      if (!qualityGate) return;
      const dens = v / w;
      if (dens > bestDens + EPS || (Math.abs(dens - bestDens) < EPS && bestId && s.start < byId[bestId].start)) {
        bestDens = dens;
        bestId = s.id;
      }
    });

    if (!bestId) break;
    chosen = closeDependencies(chosen.concat([bestId]), byId, skipDep);
  }

  chosen.sort((a, b) => byId[a].start - byId[b].start);
  const route = chosen.map((id) => byId[id]);
  const totalDuration = sumDuration(chosen, byId);
  const full = clean[clean.length - 1].end - clean[0].start;

  return {
    scenes: route,
    ids: chosen.slice(),
    totalDuration,
    totalScore: sumScore(chosen, byId, scores),
    budgetSec: B,
    coverage: full ? totalDuration / full : 0,
    bridgeId,
  };
}

export function parseRequest(text: string): ParsedRequest {
  const t = (text || "").toLowerCase();
  const out: ParsedRequest = {
    budgetMin: null,
    thread: "all",
    mood: null,
    kidsOnly: false,
    afterSec: null,
  };

  const m = t.match(/(\d+)\s*(min|minute)/);
  if (m) out.budgetMin = parseInt(m[1], 10);
  if (/mystery|investigation|detective|clue/.test(t)) out.thread = "mystery";
  else if (/romance|heart|love|family|relationship/.test(t)) out.thread = "heart";
  else if (/chase|action|run|storm/.test(t)) out.thread = "chase";

  if (/intense|tense|dramatic|exciting/.test(t)) out.mood = "intense";
  if (/gentle|calm|chill|quiet|kids|family-safe/.test(t)) out.mood = out.mood || "gentle";
  if (/kids|family-safe|family safe/.test(t)) out.kidsOnly = true;

  const s = t.match(/stopped at\s*(\d+):(\d+)|(\d+):(\d+)\s*yesterday|from\s*(\d+):(\d+)/);
  if (s) {
    const mm = s[1] || s[3] || s[5];
    const ss = s[2] || s[4] || s[6];
    if (mm !== undefined && ss !== undefined) {
      out.afterSec = parseInt(mm, 10) * 60 + parseInt(ss, 10);
    }
  }

  if (/catch me up|catch-up|re-?entry|before episode/.test(t) && out.budgetMin == null) {
    out.budgetMin = 8;
  }

  return out;
}

export function fmt(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

export function fmtRange(s: Scene): string {
  return fmt(s.start) + "–" + fmt(s.end);
}

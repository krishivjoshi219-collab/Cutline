/* CUTLINE budget solver — constraint-aware viewing.
 * Goal: maximize narrative value subject to total selected duration <= budget.
 * Deterministic 0/1 knapsack (DP over seconds) + dependency-closure repair.
 * UMD: works as a classic browser script (window.CutlineSolver) and in Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CutlineSolver = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function duration(s) { return s.end - s.start; }

  var IMPORTANCE_WEIGHT = 100;
  var PLOT_BONUS = { reveal: 12, resolution: 10, confrontation: 8, discovery: 6, twist: 5 };
  var THREAD_MATCH_BONUS = 30;
  var THREAD_MISMATCH_SCALE = 0.45;

  // Score one scene for a given request. Deterministic, no randomness.
  function scoreScene(scene, opts) {
    opts = opts || {};
    var score = scene.importance * IMPORTANCE_WEIGHT;
    // Plot-beat prior: reveals / resolutions / confrontations carry the story.
    if (scene.plot.indexOf("reveal") !== -1) score += PLOT_BONUS.reveal;
    if (scene.plot.indexOf("resolution") !== -1) score += PLOT_BONUS.resolution;
    if (scene.plot.indexOf("confrontation") !== -1) score += PLOT_BONUS.confrontation;
    if (scene.plot.indexOf("discovery") !== -1) score += PLOT_BONUS.discovery;
    if (scene.plot.indexOf("twist") !== -1) score += PLOT_BONUS.twist;
    // Thread lens: requested thread wins, others are down-weighted (not zeroed,
    // so dependency bridges can still survive).
    if (opts.thread && opts.thread !== "all") {
      if (scene.threads.indexOf(opts.thread) !== -1) score += THREAD_MATCH_BONUS;
      else score *= THREAD_MISMATCH_SCALE;
    }
    // Mood: "intense" boosts high-intensity scenes, "gentle" the opposite.
    if (opts.mood === "intense") score += (scene.intensity || 3) * 3;
    if (opts.mood === "gentle") score += (6 - (scene.intensity || 3)) * 3;
    return score;
  }

  // Close a set of scene ids under required_after dependencies.
  // skipDep(depId) optionally excuses a dependency (re-entry mode: setups
  // that aired before the stop point count as already watched).
  function closeDependencies(ids, byId, skipDep) {
    var closed = {};
    ids.forEach(function (id) { closed[id] = true; });
    var changed = true, guard = 0;
    while (changed && guard++ < 50) {
      changed = false;
      Object.keys(closed).forEach(function (id) {
        (byId[id].required_after || []).forEach(function (dep) {
          if (skipDep && skipDep(dep)) return;
          if (byId[dep] && !closed[dep]) { closed[dep] = true; changed = true; }
        });
      });
    }
    return Object.keys(closed);
  }

  function sumDuration(ids, byId) {
    return ids.reduce(function (t, id) { return t + duration(byId[id]); }, 0);
  }

  function sumScore(ids, byId, scores) {
    return ids.reduce(function (t, id) { return t + scores[id]; }, 0);
  }

  /* Build a route: ordered scene list with totalDuration <= budgetSec.
   * opts: { thread, mood, kidsOnly, afterSec (re-entry: prefer scenes after this
   *         point, keep one bridge scene before it), excludeIds }
   */
  function buildRoute(scenes, budgetSec, opts) {
    opts = opts || {};
    var byId = {};
    scenes.forEach(function (s) { byId[s.id] = s; });

    var pool = scenes.filter(function (s) {
      if (opts.kidsOnly && !s.familySafe) return false;
      if (opts.excludeIds && opts.excludeIds.indexOf(s.id) !== -1) return false;
      return true;
    });

    // Re-entry mode: hard-restrict to the bridge scene + everything after the
    // stop point so the catch-up can only move forward.
    var bridgeId = null;
    if (typeof opts.afterSec === "number") {
      var prior = null;
      pool.forEach(function (s) {
        if (s.start < opts.afterSec && (!prior || s.start > prior.start)) prior = s;
      });
      if (prior) bridgeId = prior.id;
      pool = pool.filter(function (s) {
        return s.id === bridgeId || s.start >= opts.afterSec;
      });
    }

    // Re-entry: setups that aired before the stop point count as watched.
    var skipDep = (typeof opts.afterSec === "number")
      ? function (dep) { return dep !== bridgeId && byId[dep] && byId[dep].end <= opts.afterSec; }
      : null;

    var scores = {};
    pool.forEach(function (s) { scores[s.id] = scoreScene(s, opts); });

    // 0/1 knapsack DP on integer seconds. n=28, budget<=~2700: trivial.
    var B = Math.max(0, Math.floor(budgetSec));
    var dp = new Array(B + 1).fill(0);
    var pick = new Array(B + 1).fill(null).map(function () { return []; });
    pool.forEach(function (s) {
      var w = duration(s), v = scores[s.id];
      for (var c = B; c >= w; c--) {
        var alt = dp[c - w] + v;
        if (alt > dp[c] + 1e-9) { dp[c] = alt; pick[c] = pick[c - w].concat(s.id); }
      }
    });
    var best = 0;
    for (var c = 0; c <= B; c++) if (dp[c] > dp[best] + 1e-9) best = c;
    var chosen = closeDependencies(pick[best], byId, skipDep);

    // Repair: while over budget, drop the lowest value-density non-required,
    // non-bridge scene (dependencies of kept scenes are never dropped first).
    var guard = 0;
    while (sumDuration(chosen, byId) > budgetSec && chosen.length && guard++ < 100) {
      var required = {};
      chosen.forEach(function (id) {
        (byId[id].required_after || []).forEach(function (d) { required[d] = true; });
      });
      var droppable = chosen.filter(function (id) {
        return !required[id] && id !== bridgeId;
      });
      if (!droppable.length) droppable = chosen.filter(function (id) { return id !== bridgeId; });
      if (!droppable.length) break;
      droppable.sort(function (a, b) {
        var da = scores[a] / duration(byId[a]), db = scores[b] / duration(byId[b]);
        if (da !== db) return da - db;
        return byId[a].start - byId[b].start;
      });
      var out = droppable[0];
      chosen = closeDependencies(chosen.filter(function (id) { return id !== out; }), byId, skipDep);
    }

    chosen.sort(function (a, b) { return byId[a].start - byId[b].start; });

    // Anchor enforcement: tiny budgets ("5-minute essentials") must contain the
    // point of the episode. If no reveal/resolution made the cut but one's
    // dependency closure fits, evict the lowest-density scenes until it does.
    // Restricted to cuts where the anchor matches the requested thread lens.
    (function enforceAnchor() {
      if (budgetSec > 600) return;
      var hasPayoff = chosen.some(function (id) {
        var p = byId[id].plot;
        return p.indexOf("reveal") !== -1 || p.indexOf("resolution") !== -1;
      });
      if (hasPayoff) return;
      var cands = pool.filter(function (s) {
        var isPayoff = s.plot.indexOf("reveal") !== -1 || s.plot.indexOf("resolution") !== -1;
        if (!isPayoff) return false;
        if (opts.thread && opts.thread !== "all" && s.threads.indexOf(opts.thread) === -1) return false;
        if (opts.kidsOnly && !s.familySafe) return false;
        return true;
      });
      cands.sort(function (a, b) {
        if (scores[b.id] !== scores[a.id]) return scores[b.id] - scores[a.id];
        return a.start - b.start;
      });
      for (var i = 0; i < cands.length; i++) {
        var need = closeDependencies([cands[i].id], byId, skipDep);
        var w = sumDuration(need, byId);
        if (w > budgetSec) continue;
        var inRoute = {};
        chosen.forEach(function (id) { inRoute[id] = true; });
        // Evict lowest value-density scenes (never the re-entry bridge) first.
        var evictable = chosen.filter(function (id) { return id !== bridgeId; });
        evictable.sort(function (a, b) {
          var da = scores[a] / duration(byId[a]), db = scores[b] / duration(byId[b]);
          if (da !== db) return da - db;
          return byId[a].start - byId[b].start;
        });
        var kept = chosen.slice();
        while (sumDuration(closeDependencies(kept.concat(need.filter(function (id) { return kept.indexOf(id) === -1; })), byId, skipDep), byId) > budgetSec && evictable.length) {
          var out = evictable.shift();
          kept = kept.filter(function (id) { return id !== out; });
        }
        chosen = closeDependencies(kept.concat(need), byId, skipDep);
        if (sumDuration(chosen, byId) <= budgetSec) return;
      }
    })();

    // Fill pass: DP + repair can leave budget stranded (a picked scene's
    // dependency chain may evict it and waste the space). Greedily add the
    // best-density closure that still fits, so small budgets stay full
    // without diluting large ones with low-value filler.
    (function fill() {
      var routeAvg = chosen.length
        ? sumScore(chosen, byId, scores) / sumDuration(chosen, byId) : 0;
      var guard = 0;
      while (guard++ < 100) {
        var remaining = budgetSec - sumDuration(chosen, byId);
        if (remaining < 25) break; // nothing meaningful fits below this
        var inRoute = {};
        chosen.forEach(function (id) { inRoute[id] = true; });
        var bestId = null, bestDens = -1;
        pool.forEach(function (s) {
          if (inRoute[s.id]) return;
          var closure = closeDependencies([s.id], byId, skipDep).filter(function (id) { return !inRoute[id]; });
          var w = sumDuration(closure, byId);
          if (w > remaining || w <= 0) return;
          var v = sumScore(closure, byId, scores);
          var qualityGate = chosen.length < 3 || (v / w) >= routeAvg * 0.5;
          if (!qualityGate) return;
          var dens = v / w;
          if (dens > bestDens + 1e-9 ||
              (Math.abs(dens - bestDens) < 1e-9 && bestId && s.start < byId[bestId].start)) {
            bestDens = dens; bestId = s.id;
          }
        });
        if (!bestId) break;
        chosen = closeDependencies(chosen.concat([bestId]), byId, skipDep);
      }
    })();

    chosen.sort(function (a, b) { return byId[a].start - byId[b].start; });
    var route = chosen.map(function (id) { return byId[id]; });
    var totalDuration = sumDuration(chosen, byId);
    var full = scenes[scenes.length - 1].end - scenes[0].start;
    return {
      scenes: route,
      ids: chosen.slice(),
      totalDuration: totalDuration,
      totalScore: sumScore(chosen, byId, scores),
      budgetSec: budgetSec,
      coverage: full ? totalDuration / full : 0,
      bridgeId: bridgeId
    };
  }

  // Simple deterministic natural-language request parser (mock AI layer).
  function parseRequest(text) {
    var t = (text || "").toLowerCase();
    var out = { budgetMin: null, thread: "all", mood: null, kidsOnly: false, afterSec: null };
    var m = t.match(/(\d+)\s*(min|minute)/);
    if (m) out.budgetMin = parseInt(m[1], 10);
    if (/mystery|investigation|detective|clue/.test(t)) out.thread = "mystery";
    else if (/romance|heart|love|family|relationship/.test(t)) out.thread = "heart";
    else if (/chase|action|run|storm/.test(t)) out.thread = "chase";
    if (/intense|tense|dramatic|exciting/.test(t)) out.mood = "intense";
    if (/gentle|calm|chill|quiet|kids|family-safe/.test(t)) out.mood = out.mood || "gentle";
    if (/kids|family-safe|family safe/.test(t)) out.kidsOnly = true;
    var s = t.match(/stopped at\s*(\d+):(\d+)|(\d+):(\d+)\s*yesterday|from\s*(\d+):(\d+)/);
    if (s) {
      var parts = s.slice(1).filter(Boolean).map(Number);
      out.afterSec = parts[0] * 60 + parts[1];
    }
    if (/catch me up|catch-up|re-?entry|before episode/.test(t) && out.budgetMin == null) out.budgetMin = 8;
    return out;
  }

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function fmtRange(s) { return fmt(s.start) + "\u2013" + fmt(s.end); }

  return { buildRoute: buildRoute, scoreScene: scoreScene, parseRequest: parseRequest, fmt: fmt, fmtRange: fmtRange, duration: duration };
});

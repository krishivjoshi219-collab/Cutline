# CUTLINE — “I have 15 minutes. Give me the story.”

Fire TV track · Amazon App Dev Hackathon 2026 · Concept 02

**One-line pitch:** Cutline keeps the story, cuts the wandering — tell the TV how
much time you have and it builds a playable cut from the original footage.

> Not a recap. A version you can finish.

## What it is

Cutline turns a full-length episode (**“Harbor Lights” S01E07, 52:14, 28 scenes**)
into a **time-budgeted viewing route**: the viewer picks 5 / 15 / 30 minutes (or any
custom budget, or a plain-English request), and the app selects the most
story-critical **original scenes** and plays them back-to-back as one coherent cut —
with visible jumps, a story heatmap, and a countdown of remaining cut time.

## Run it (no build step)

```bash
npm test          # 36 solver/playback checks, zero dependencies
npm run serve     # http://localhost:8080  (any static server works)
```

Open `index.html` over `http://` (not `file://`, so `data/scenes.json` parity can be
verified). Works with mouse, keyboard, and Fire TV remote keys
(arrows / OK / Back / Space). If the sample video can't load (offline), the player
falls back to a simulated-footage canvas — routing works fully offline.

## Demo in 30 seconds

1. Land on **15:00 STORY ROUTE** — route preview + heatmap already built.
2. Press **▶ Play this cut** — original footage plays scene-to-scene with
   “✂ CUTLINE JUMP” transitions and a live cut countdown.
3. Hit **‹ Back**, drag the **time-morph slider** 5 → 45, type
   **“Only the mystery thread”** or **“Kids have 8 minutes”** — the route rebuilds live.

Full judge script: [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md).
How it works: [`ARCHITECTURE.md`](ARCHITECTURE.md).
Build notes: [`FRICTION_LOG.md`](FRICTION_LOG.md).

## Repo map

| Path | Purpose |
|---|---|
| `index.html` | 10-foot UX shell (choose → play screens, tech modal) |
| `styles.css` | TV-first theme: huge type, focus rings, high contrast |
| `js/app.js` | Budget UI, route preview, heatmap, NL parsing, Fire TV remote nav |
| `js/solver.js` | Budget solver: knapsack DP + anchor enforcement + dependency repair + fill (UMD: browser + Node) |
| `js/player.js` | Playback queue: episode→video time mapping, transitions, offline sim fallback |
| `js/scenes.js` / `js/episode.js` | Scene index + episode constants (`file://`-safe mirrors) |
| `data/scenes.json` | Source of truth: 28 scenes, start/end + importance + threads + deps |
| `tests/solver.test.cjs` | Budgets, order, deps, anchors, lenses, re-entry, NL, monotonicity, mapping |

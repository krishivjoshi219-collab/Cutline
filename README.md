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

## Run it (React Native / Expo, Fire TV)

```bash
npm install
npm run tsc      # typecheck (solver, data, UI)
npm start        # Expo dev server — open on Fire TV via dev client
npm run android  # run on a connected Android / Fire TV device (adb)
```

Fire TV APK + Vega OS package are built in CI
([`build-firetv-apk.yml`](.github/workflows/build-firetv-apk.yml)); download
them from **Actions → Artifacts** and sideload with
`adb install app-debug.apk`.

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

| Path                                      | Purpose                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `App.tsx`                                 | 10-foot UX: home → choose → play, D-pad / remote handling                  |
| `src/solver.ts`                           | Budget solver: knapsack DP + anchor enforcement + dependency repair + fill |
| `src/scenes.json` + `src/data.ts`         | Source of truth: 28 scenes, start/end + importance + threads + deps        |
| `src/fireos.ts`                           | FireOS helpers: remote events, platform detection                          |
| `manifest.toml` + `scripts/build-vpkg.sh` | Vega OS packaging (`.vpkg`)                                                |
| `.github/workflows/build-firetv-apk.yml`  | CI: Fire TV APK + Vega package                                             |

`ARCHITECTURE.md`, `DEMO_SCRIPT.md` and `FRICTION_LOG.md` describe the
original prototype that this RN app was ported from.

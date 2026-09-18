# CUTLINE — Architecture

## Layers (strategy §6, as built)

| Layer                 | Implementation                                     | Purpose                                                          |
| --------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Fire TV player        | `App.tsx` + `react-native-video`                   | Play / pause / seek between segments; episode→video time mapping |
| Scene index           | `src/scenes.json` (28 scenes, 0–3134 s contiguous) | Candidate cuts: start/end + importance + plot/threads/deps       |
| Story graph           | `required_after` chains (e.g. reveal → clue)       | No setup-less reveals, no nonsense jumps                         |
| Budget solver         | `src/solver.ts`                                    | Maximize narrative value, Σ duration ≤ budget                    |
| AI enhancement (mock) | `parseRequest()` + thread/mood scoring             | NL requests → {budget, thread, mood, kids, re-entry point}       |
| Playback queue        | Ordered scene list + `CutlinePlayer`               | Seeks per interval; transition toasts; cut countdown             |

## The algorithm (deterministic, no network, no randomness)

1. **Score** every scene:
   `100·importance + plot prior (reveal+12, resolution+10, confrontation+8,
discovery+6, twist+5) + thread lens (+30 match / ×0.45 other) + mood`.
2. **Knapsack DP** over integer seconds — optimal value-density packing.
3. **Dependency repair** — close under `required_after`; evict lowest-density
   non-required scenes until back under budget. A reveal never plays bare.
4. **Anchor enforcement** (budgets ≤ 10 min) — evict trivia until the best-fitting
   reveal/resolution closure fits. This is what makes 5:00 ESSENTIALS open the
   boathouse door instead of showing four disconnected vignettes.
5. **Closure-aware fill** — spend stranded seconds on the best fitting closure,
   gated by a quality floor so big cuts aren't diluted with filler.
6. **Re-entry rule** — setups that aired before the stop point count as watched:
   closures only pull in forward-window scenes plus one bridge scene.

Verified properties (`npm test` + 720-route fuzz): hard budget cap, narrative
order, dependency closure, determinism, monotonic time-morph, offline mapping.

## Playback mapping

Scene timestamps address the 52:14 episode. The demo asset (Big Buck Bunny,
~10 min, CORS-open sample) is addressed proportionally:
`videoTime = episodeTime / 3134 × video.duration`. Swap `DEMO_VIDEO_SOURCES`
for any licensed/cleared asset — routing is asset-independent. Offline →
canvas sim mode; all routing UI keeps working.

## What was deliberately NOT built

Catalog integration, real LLM calls, server backend, edit-level trimming
(scenes are atomic units) — per the strategy's “single controlled demo” rule.
Natural-language understanding is a deterministic parser standing in for the
LLM ranker behind the same `{budget, thread, mood}` interface.

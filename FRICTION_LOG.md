# CUTLINE — Friction log (built remote-first, in one session)

1. **Knapsack + dependencies stranded the budget.** Pure DP picked the 224 s reveal,
   closure added its setup chain, repair evicted the reveal — 5 min yielded 2:08 of
   trivia. Fixed with anchor enforcement (≤10 min budgets lock a fitting
   reveal/resolution first) + closure-aware fill. Lesson: optimize _closures_,
   not scenes.
2. **Small budgets need payoff, big budgets need density.** One objective can't do
   both — hence phased solver (DP → repair → anchor → fill) instead of cleverer
   weights. Each phase has its own test.
3. **Catch-up vs. closure conflict.** Strict deps replayed a setup the viewer had
   already seen. Fix: pre-stop dependencies count as watched; only forward-window
   scenes are pulled in. Semantics beat uniformity.
4. **Doc's own 15:00 route sums to 16:00.** The five illustrative segments can't fit
   a hard 900 s cap. Kept the cap hard (credibility) and assert _functions_
   (discovery / confrontation / reveal covered), not exact IDs.
5. **No copyrighted catalog for the MVP.** Episode timestamps address the 52:14
   story; the sample asset is addressed proportionally and swappable. Offline →
   canvas sim. Demo never depends on network for its thesis.
6. **Fire TV remote without a TV.** Spatial nav (nearest-neighbor focus) + standard
   key codes (arrows/Enter/Back/Space) tested by reasoning; slider keeps native
   arrow behavior so D-pad left/right still scrubs time.

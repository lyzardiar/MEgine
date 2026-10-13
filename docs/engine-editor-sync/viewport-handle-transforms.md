# Viewport selection handle transforms

Author: MiYu

Selection handles consume the world transforms already resolved for the same Scene frame. Pointer-down and drag updates similarly reuse their current live transform map. Callers without a supplied map resolve only the primary object, selected hierarchy roots and their ancestors. Gizmo pivot/center semantics and parent rotation/scale remain unchanged; mutable editor gestures do not retain a transform map across edits.

## Evidence

The baseline main-thread CPU profile attributed 803.209 ms of a 10,267.141 ms sample to `transformHandleOrigin` and its descendants. Of that, 399.112 ms was self time in the world-transform resolver. Scene painting already had the current frame's world transforms, but handle-origin calculation rebuilt the entire scene's transforms again. The decoded baseline symbol was `Jd` in `App-BHlhHP22.js`, zero-based line 106, column 8554.

A separate Chromium trace records browser scheduling and composition at `D:/MEngineNativeQA/rpg-multiview-browser-trace-1791927410629`. Its task durations include child work and cannot be summed as independent CPU costs. The trace experiment itself changed mean Game completion interval from 22.854 ms without tracing to 24.119 ms with tracing. It is diagnostic evidence, not the performance acceptance baseline.

## Release comparison

Fixed scene/script revision `3098765`, identical multiview QA setup, baseline engine `6a03062`:

| Layout | Game completion interval before / after | Scene completion interval before / after |
| --- | --- | --- |
| Scene + Game + selected camera preview + Profiler | 25.452 / 23.134 ms | 22.086 / 20.784 ms |
| Scene + Game + Profiler | 21.646 / 21.313 ms | 20.340 / 19.934 ms |
| Game + Profiler | 19.150 / 19.001 ms | inactive |
| Game, Profiler hidden | 19.046 / 18.352 ms | inactive |
| Repeated selected-camera multiview layout | 25.937 / 23.436 ms | 22.823 / 21.562 ms |

The two selected-camera multiview stages improved about 9-10%. The optimized handle-origin function had no CPU samples in the corresponding 10,256 ms repeat profile; this means it fell below sampling resolution or was inlined, not that execution took literally zero time. Code and tests separately establish that the redundant whole-scene transform calculation was removed.

Native rendering remained around 8.2 ms. Game upload averaged 0.668 / 0.611 ms in the two multiview stages, versus 0.424 / 0.421 ms before. Shared-buffer reuse was 84.6% / 89.7% in those stages, so the previous capacity optimization does not guarantee 100% reuse under every scheduling interleaving. Complete measured cadence still improved.

The QA process is hidden and unfocused, with browser background throttling disabled. This is a controlled comparison, not foreground interaction acceptance on the user's other computer. These completion intervals also do not directly measure physical display scanout. The reported approximately 200 ms issue remains unresolved there.

## Validation

- 27 selection, world-transform and native-presentation tests passed. Coverage includes selected descendants, unrelated geometry exclusion, parent rotation, negative scale, supplied-frame reuse, and fresh transforms after live edits.
- Frontend typecheck/production build and custom-protocol native Release build passed. Native build took 4m 25s with the existing unused-function warning.
- Five real-editor measurement stages passed. Active captures: Game 303 ms, Scene 287 ms. Following second: 46 Game and 48 Scene frames.
- Alternating Scene/preview pixel differences: 140 / 230,400 and 68 / 57,600, within the existing 0.5% animation tolerance. The selected-camera screenshot was visually inspected.
- Console errors: zero. Owned editor exited normally; Windows denied runtime-directory removal, so it was retained. No user editor was closed.

`viewport-handle-transforms.json` contains the metrics and diagnostic pointers. Raw acceptance: `D:/MEngineNativeQA/rpg-multiview-handle-final-1791928198585`; baseline: `D:/MEngineNativeQA/rpg-multiview-capacity-final-1791927074489`.

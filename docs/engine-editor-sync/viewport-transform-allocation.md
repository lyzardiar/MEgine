# World-transform allocation and Profiler recording costs

Author: MiYu

The browser world-transform resolver now writes completed values directly into its result map. A reserved invalid marker tracks the current recursion path while retaining first-visit order. This removes the intermediate state map, its visiting/completed wrapper objects and the final map-copy pass. A completed invalid hierarchy node still gets its own resolved value; the recursion marker is never exposed as a completed node.

Parent rotation/scale, activation, missing parents, cycles, sparse requests, duplicate IDs and owned-frame cache invalidation retain their existing behavior. Mutable editor worlds remain uncached. This shared editor module serves browser and native-hosted viewports.

## Verification

- 28 world-transform, selection and displayed-frame tests passed, including an explicit cycle/missing-parent/order regression.
- A comparison against the source from engine baseline `425d11f` checked 400 immutable world revisions, including reordered/duplicate records, missing parents, cycles and retained historical snapshots. Cached, uncached and sparse results matched the baseline, including map insertion order.
- Node microbenchmark: 4,445 entities, 120 revisions with 40 replaced records per revision, four passes per sample and eight alternating before/after samples after warmup. The median per-resolution time was 0.846451 ms before and 0.595434 ms after, about 29.7% lower. This is a function benchmark, not an FPS claim.
- Frontend typecheck/production build and native custom-protocol Release build passed. Native build took 4m 29s and retained the existing unused-function warning.

The comparison runner and raw results are at `D:/MEngineNativeQA/benchmark-world-transform.mjs` and `D:/MEngineNativeQA/world-transform-benchmark.json`. The baseline implementation was captured from Git into `D:/MEngineNativeQA/world-transform-before.mjs`.

## Release acceptance

Both runs used fixed scene/script `3098765`, the same viewport sizes and quality settings, and the same five-stage runner with CPU sampling enabled. Complete Game frame intervals changed as follows:

| Layout | Mean before / after | P95 before / after |
| --- | --- | --- |
| Scene + Game + selected-camera preview + Profiler | 23.308 / 22.957 ms | 38.3 / 36.7 ms |
| Scene + Game + Profiler | 21.962 / 21.332 ms | 34.0 / 33.4 ms |
| Game + Profiler | 19.014 / 18.433 ms | 23.0 / 22.5 ms |
| Game, Profiler hidden | 18.753 / 18.766 ms | 22.8 / 23.5 ms |
| Repeated selected-camera multiview layout | 23.396 / 23.123 ms | 37.7 / 35.0 ms |

The two selected-camera stages show only about 1.2-1.5% lower Game means. Scene means were 21.064 / 20.761 ms and 21.274 / 21.459 ms respectively; not every metric improved. Short runs include scheduling noise and do not establish a broad FPS guarantee. The matching browser resolver symbol (`Zn`, UI-layout chunk, zero-based line 5 column 3713; both bodies inspected) accumulated 491.714 / 445.375 ms self time in the first stage and 491.962 / 446.012 ms in the repeat, over roughly 10.2 seconds each. This is about 9% lower sampled self time, distinct from the Node microbenchmark.

All five stages completed without browser long tasks. Active Game/Scene captures took 295/283 ms; the following second produced 41 Game and 48 Scene frames. Alternating Scene/preview differences were 138/230,400 and 67/57,600 pixels, within the existing 0.5% animation tolerance. The multi-view screenshot was inspected. Console errors were zero. The owned editor exited normally; Windows denied runtime-directory removal, so that directory was retained. No user editor was closed.

The processes were hidden and unfocused, with background throttling disabled. These tests measure local completion cadence, not physical scanout or the other computer's foreground behavior. The approximately 200 ms issue remains unresolved there. Baseline: `D:/MEngineNativeQA/rpg-multiview-transform-map-before-1791929521969/report.json`; acceptance: `D:/MEngineNativeQA/rpg-multiview-transform-map-after-1791929939106/report.json`. Compact metrics are in `viewport-transform-allocation.json`.

## Profiler recording experiment

An independent owned-Release experiment selectively bypassed only the native-profile `structuredClone` and `BroadcastChannel.postMessage` calls in the QA page. Frame rendering, native metadata generation, history insertion and local notifications remained active. The bypass is not a production change and is not equivalent to disabling all profiling.

Across two normal eight-second groups, 745/774 profiles spent 142.8/146.5 ms cloning and 180.6/180.4 ms broadcasting, approximately 0.42-0.43 ms combined per profile. Normal Game mean intervals were 22.768/21.768 ms; bypassed groups were 21.865/21.156 ms. The short sequential comparison also contains time drift, so it does not isolate a stable end-to-end speedup. All four groups had zero long tasks; console errors were zero and the owned editor exited normally.

Raw report: `D:/MEngineNativeQA/rpg-multiview-profiler-recording-1791929289628/report.json`. Runner: `D:/MEngineNativeQA/profile-profiler-recording.mjs`. Recording-copy/broadcast costs are measurable but do not explain the user's approximately 200 ms frame interval.

## Next architectural investigation

Current Play Scene and Game commands use separate renderers but share `EditorPlayRuntime.render_world`. That mirror lock remains held through frame compilation, GPU submission and readback. The camera preview already has a separate mirror. A separate Scene mirror could remove cross-view serialization while retaining the same published revision history; it adds another ECS mirror and synchronization work, so complete cadence and memory must be measured.

An independent read-only review agrees that the existing generation checks and source-snapshot filtering can be retained. Required validation includes blocked Scene versus progressing Game/preview, exact and expired revisions in all views, stop/restart during an active or queued Scene render, and hidden-object filtering after entity-slot reuse. This split is not implemented by the transform-allocation change.

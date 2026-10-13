# Viewport shared mapping lifetime

Author: MiYu

Windows WebView2 viewport frames retain up to three pooled browser mappings with a 96 MiB cache budget. Each completed upload still acknowledges its own native request and lease. The native pool only overwrites pages after both Post returns and that acknowledgement arrives. Retention saves mapping-related first-read cost while preserving frame ownership and pixel contents.

Only a matching native buffer ID and byte length can reuse an idle mapping. Nonpooled frames and older hosts without a valid ID retain their existing release behavior. Cache eviction preserves active consumers; window replacement, pagehide and binary fallback clear retained mappings. A pending frame arriving after pagehide is consumed without repopulating the cache. In-flight frames removed from the cache remain owned until consumption, so the cache budget is not a cap on all live transport buffers. Cleanup errors are logged; a failed reuse releases through the normal incoming-frame consumer path.

## Measurements

Fixed input: sample scene/script revision `3098765`, 2560 x 1440 editor window, requested Game 1920 x 1080 / actual 1225 x 689, 4x MSAA, Scene, Game and selected camera preview. The QA editor is owned by the runner and uses background-throttling overrides. These figures do not reproduce the user's other machine or its approximately 200 ms frame interval.

An in-process A/B experiment alternated direct/cached/cached/direct mappings. Game pixel upload averaged 1.224 / 0.213 / 0.202 / 1.236 ms; corresponding completed update intervals were 25.058 / 23.247 / 23.697 / 25.268 ms. There were 201 complete buffer comparisons with zero differing bytes, no detached retained mappings, and 1,488 reuse hits.

Production Release comparison against `0c630c9`:

| Layout | Game update interval before / after | Complete upload before / after |
| --- | --- | --- |
| Scene + Game + camera preview + Profiler | 27.312 / 25.469 ms | 1.472 / 0.928 ms |
| Scene + Game + Profiler | 22.507 / 21.517 ms | 1.443 / 0.860 ms |
| Game + Profiler | 18.688 / 19.040 ms | 1.524 / 0.875 ms |
| Game, Profiler hidden | 18.818 / 18.870 ms | 1.518 / 0.839 ms |
| Repeated Scene + Game + camera preview + Profiler | 27.084 / 25.282 ms | 1.484 / 0.883 ms |

The repeated multiview interval improved about 6.7%; standalone Game cadence did not materially improve. Native render time remained approximately 8.3 ms. Complete upload includes metadata parsing and instrumentation, so it differs from isolated pixel upload. This is a local transport improvement, not evidence that the reported 200 ms issue is resolved.

## Validation

- 36 targeted transport, frame, presentation and repaint tests passed. Coverage includes lease acknowledgement, concurrent frames, mapping bounds, resize, window replacement, pagehide, binary fallback, release failure and late events.
- Frontend typecheck/production build and custom-protocol native Release build passed. The native build took 4m 35s and retains an existing unused-function warning.
- Five real-editor measurement stages passed. Active Play captures: Game 296 ms, Scene 275 ms. The following second produced 43 Game and 47 Scene frames.
- Alternating Scene/camera-preview pixel checks passed: 139 / 230,400 and 63 / 57,600 pixels differed, below the existing 0.5% animation tolerance. This is separate from the exact-byte mapping comparison above.
- Console errors: zero. Owned editor exited normally; Windows denied removal of its runtime directory, which was retained. No user editor was closed.
- Independent lifetime review: no blocking findings.

## Evidence and architectural scope

`viewport-shared-mapping.json` contains the before/after stage summaries and the A/B experiment. Raw captures: `D:/MEngineNativeQA/rpg-multiview-mapping-final-1791925893022`; baseline: `D:/MEngineNativeQA/rpg-multiview-viewport-capture-final-1791923362806`; exact-byte A/B: `D:/MEngineNativeQA/rpg-multiview-mapping-reuse-page-enabled-1791925258027`.

The render path still waits for GPU readback, copies pixels to CPU/shared memory and uploads them to WebView Canvas. The user's screenshot showed 21.2 ms native rendering versus 181.1 ms presented interval and 177.4 ms WebView interval. It does not attribute the missing time to draw calls or the Profiler panel. Further work must measure end-to-end scheduling and presentation, alongside GPU readback, without treating native render time as the full frame. The current local visible/hidden Profiler comparison does not show a material panel cadence penalty; it does not disable all underlying instrumentation.

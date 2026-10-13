# Viewport buffer capacity reuse

Author: MiYu

The native shared-buffer pool reuses the smallest idle allocation with sufficient capacity. Each frame may consume the remaining capacity as JSON whitespace before the current RGBA payload, up to a 256 KiB metadata region. The header describes that exact padded region, so the existing browser parser still verifies the full buffer length and reads the current pixels. The pool retains its three-slot / 96 MiB limit and only reuses a slot after both Post completion and the matching browser consumption acknowledgement.

This removes allocation churn caused by ordinary changes in serialized Profiler metadata length. The baseline Game viewport kept the same 1225 x 689 pixels while its padded metadata fluctuated between 143,360 and 147,456 bytes. In the repeated 10-second multiview sample, 404 frames used 189 different buffer IDs and the pool hit rate was 53.2%.

## Release measurement

The fixed-input QA scene/script is revision `3098765`, with the same dimensions and background-throttling overrides as the preceding mapping-lifetime measurement. Baseline engine revision is `02fc940`. These measurements are local and do not reproduce the user's other machine.

| Layout | Pool hit before / after | Buffer IDs before / after | Upload before / after | Game interval before / after |
| --- | --- | --- | --- | --- |
| Scene + Game + camera preview + Profiler | 54.6% / 100% | 182 / 1 | 0.928 / 0.424 ms | 25.469 / 25.452 ms |
| Scene + Game + Profiler | 53.6% / 100% | 221 / 1 | 0.860 / 0.386 ms | 21.517 / 21.646 ms |
| Game + Profiler | 54.3% / 100% | 246 / 1 | 0.875 / 0.383 ms | 19.040 / 19.150 ms |
| Game, Profiler hidden | 57.3% / 100% | 230 / 1 | 0.839 / 0.380 ms | 18.870 / 19.046 ms |
| Repeated multiview layout | 53.2% / 97.0% | 189 / 13 | 0.883 / 0.421 ms | 25.282 / 25.937 ms |

Upload cost and allocation churn improved. Complete frame cadence did not show a stable improvement. Returning to the multiview layout still caused some pool replacement; this change does not promise that one buffer ID remains assigned to a viewport forever.

A separate hardware-timestamp run collected 417 Game and 483 Scene profiles. Game GPU stages totalled about 2.03 ms, including 1.62 ms Forward HDR and 0.12 ms readback copy. Baseline CPU time awaiting readback was about 2.33 ms. GPU timestamps overlap CPU/wait measurements and must not be added to them. These local GPU costs do not explain the user's approximately 200 ms WebView/presented interval; scheduling and presentation remain unresolved.

## Validation

- Eight native transport tests passed: capacity selection, active-lease protection, memory limits, metadata fluctuations, resized pixel payloads, exact IPC wire behavior and trace bounds.
- Twenty-five browser transport/frame tests passed using the existing protocol parser.
- Custom-protocol Release build passed in 4m 29s, with the existing unused-function warning. Frontend source was unchanged.
- All five real-editor measurement stages passed. Active captures: Game 288 ms, Scene 278 ms. Following second: 39 Game and 46 Scene frames.
- Alternating Scene/preview pixel differences were 152 / 230,400 and 60 / 57,600, below the existing 0.5% animation tolerance. Native unit tests separately compare metadata revisions and RGBA bytes exactly.
- Console errors: zero. Owned editor exited normally; Windows denied runtime-directory removal, so that directory was retained. User editor processes were not closed.
- Independent capacity/lifetime review found no blockers.

`viewport-buffer-capacity.json` records stage summaries and the GPU diagnostic. Raw QA: `D:/MEngineNativeQA/rpg-multiview-capacity-final-1791927074489`; baseline: `D:/MEngineNativeQA/rpg-multiview-mapping-final-1791925893022`; GPU diagnostic: `D:/MEngineNativeQA/rpg-multiview-gpu-readback-1791926289037`.

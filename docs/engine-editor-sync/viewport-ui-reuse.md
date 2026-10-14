# Scene UI topology and text layout reuse

Author: MiYu

Completed Scene frames retain their own world records. The browser UI reader now reuses Canvas/camera membership indices while entity IDs, parents, order and Canvas/camera root membership remain unchanged. Unit motion, active flags and text changes still use the current frame's records. Hierarchy changes recompute membership with the existing traversal, including its handling of duplicate IDs, missing parents and cycles. No UI entity records are retained by the topology cache.

Canvas text layout reuses the existing rich-text, wrapping, best-fit and kerning algorithm's complete results. Each Canvas context retains at most 256 results and 32,768 UTF-16 key units. Text over 2,048 UTF-16 units and non-finite numeric options bypass this cache. The key includes the text, font, all layout options and actual measurement state. Font revision changes clear the cache. Empty-font Canvas measurement remains distinct from bitmap fallback; arbitrary custom measurements retain their uncached behavior. Layout results are shared read-only by intrinsic-size calculation, Scene bounds and drawing.

These changes reduce repeated browser work while preserving Scene interaction, camera preview and UI behavior. They do not replace the GPU → CPU readback → WebView → Canvas presentation route, and do not establish resolution of the user's remote approximately 200 ms frame interval.

Validation covers 115 passing tests across Canvas rendering/modes, font loading, text layout, native frame ownership and presentation. New cases verify all text layout options, current Canvas state, font invalidation, cache bounds, and current-frame identity through topology changes. TypeScript and production frontend build pass. Independent read-only review found no blocking issue.

The fixed Frost fixture is commit `3098765`, hosted by Release `cbbd56b`, with a 2560×1440 editor, requested 1920×1080 Game output rendered at 1225×689, and 4× MSAA. Both runs use an owned background editor with browser background throttling disabled. Production frontend files are supplied through CDP in both runs. Each stage samples ten seconds with 1 ms browser CPU sampling; no build or other GPU test runs during measurement.

| Stage | Game interval mean before → after | Game P95 before → after | Scene interval mean before → after |
| --- | --- | --- | --- |
| Scene + Game + camera preview | 22.00 → 20.59 ms | 36.7 → 30.9 ms | 19.87 → 19.47 ms |
| Scene + Game | 20.47 → 19.76 ms | 31.2 → 26.8 ms | 19.56 → 19.30 ms |
| Game | 18.52 → 18.41 ms | 24.0 → 22.6 ms | inactive |
| Game, Profiler hidden | 18.96 → 18.78 ms | 24.1 → 23.2 ms | inactive |
| Scene + Game + camera preview, repeated | 21.91 → 21.29 ms | 36.2 → 32.0 ms | 19.78 → 19.82 ms |

UI module sampled self CPU totals in the three dual-view samples fall from 1859/1520/1776 ms to 1594/1284/1515 ms per ten-second window, approximately 14–15%. These are sampled module totals, not exact per-frame durations. Game-only and Scene intervals include variation; this is not a claim that every frame improves. The local samples still exceed a sustained 16.7 ms budget, and cannot verify performance on the user's other computer.

All five candidate stages have zero recorded long tasks and zero console errors. Captures recover with 53 Game / 54 Scene frames in the following second. Alternating Scene/preview differences are 160/230400 and 56/57600 pixels, within the existing animation tolerance. `viewport-ui-reuse.json` contains measurements, scope and evidence paths.

The final Release build passes in 4m39s with the existing unused-function warning. A separate run of that EXE uses its embedded frontend without resource interception. Game/Scene captures complete in 301/271 ms; the following second produces 47 Game / 50 Scene frames; alternating-view pixel differences are 118/230400 and 66/57600. It records zero console errors, the screenshot was inspected, and the owned editor exits normally. This short run validates the packaged consumer path, not sustained foreground FPS.

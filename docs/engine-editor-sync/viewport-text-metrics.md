# Bounded Canvas text measurements

Author: MiYu

Scene Play performs browser UI layout for each completed native frame. Its glyph and kerning measurements now survive subsequent paints of the same Canvas context. Each cache holds at most 4,096 entries; contexts are weakly referenced. Font asset refresh, project reset, imported font completion, browser font events and Canvas text state changes invalidate measurements. Text content, font, size and style retain separate keys. Layout and rendering continue to consume the displayed world's entity records.

## Validation

The Canvas rendering, font assets and Scene/Game completion suites pass 61 tests with zero failures. Coverage includes font fallback replacement without a browser event, project refresh/reset, text state changes, context isolation, bounded eviction, camera changes, capture and completion pacing. TypeScript and the editor production frontend build pass. Independent read-only review found no blocking issue.

The fixed Frost fixture is commit `3098765`, using the Release native host at `63ce0e6`, a 2560×1440 host, a 1920×1080 requested Game view rendered at 1225×689, and 4× MSAA. Both runs use an owned hidden editor with background throttling disabled. Each stage records ten seconds with 1 ms browser CPU sampling. Baseline response interception preserves the original JavaScript bytes; the candidate serves the built production frontend through CDP. No build runs during timed samples.

| Stage | Game interval mean before → after | Game P95 before → after | Scene interval mean before → after |
| --- | --- | --- | --- |
| Scene + Game + camera preview | 22.50 → 21.56 ms | 37.0 → 36.7 ms | 19.64 → 19.57 ms |
| Scene + Game | 20.48 → 20.32 ms | 32.8 → 32.0 ms | 19.34 → 19.58 ms |
| Game | 18.77 → 18.43 ms | 23.7 → 22.4 ms | inactive |
| Game, Profiler hidden | 18.44 → 18.57 ms | 22.7 → 23.3 ms | inactive |
| Scene + Game + camera preview, repeated | 22.71 → 21.93 ms | 38.2 → 36.2 ms | 20.26 → 20.15 ms |

In the three dual-view samples, accumulated `uiLayout` JavaScript self time falls from 2,189/1,881/2,198 ms to 1,812/1,572/1,815 ms, about 16–17%. Native browser `measureText` sampled self time falls from 133/109/114 ms to 2/1/0 ms. These are sampled CPU totals across each ten-second window, not per-frame times or exact call counts. Game-only measurements show normal variation; this does not establish a universal frame-rate improvement.

All five candidate stages have zero recorded long tasks and zero console errors. Game and Scene captures complete; the next second records 50 Game and 53 Scene frames. Alternating Scene/preview renders differ by 162/230400 and 61/57600 pixels, within the existing 0.5% animation tolerance. The screenshot was inspected. Full measurements and evidence paths are in `viewport-text-metrics.json`.

The final Release build passes in 4m25s with the existing unused-function warning. A separate run of that EXE uses its embedded frontend without response interception and passes the dual-view capture, continued-frame and alternating-view pixel checks. This short run verifies packaging and runtime correctness; it is not another ten-second performance comparison.

## Rendering and profiling limits

The user's screenshot reports 21.2 ms native rendering, 181.1 ms completed-frame interval and 177.4 ms WebView frame interval. Those are different scopes. The native value includes GPU waiting and is not a hardware GPU duration. Their difference identifies substantial work or waiting outside native rendering, without identifying its cause on that machine.

The current display route remains GPU rendering → CPU readback → shared-buffer delivery → Canvas upload/composition. Multiple views multiply both rendering and browser work. Removing repeated text measurement reduces one measured browser cost; it does not remove the readback and presentation architecture's transfer and scheduling costs. A native GPU presentation path is still an architectural priority, with camera preview, editor overlays, hit testing, capture, resize and device-loss behavior as required acceptance cases.

The Profiler reports native command scopes and IPC/delivery/upload separately. Completed uploads, browser paint intervals and physical compositor presentation must remain distinct; simulation and GPU scopes may overlap. The current measurements do not prove the Profiler has zero overhead, and cannot establish the cause of the remote 200 ms case. CPU sampling itself is enabled in both compared runs. The local fixture still exceeds the 16.7 ms budget for 60 Hz.

A separate scheduling A/B deferred the Scene completion callback to a zero-delay task. Game improved by about 0.6 ms in preview stages while Scene regressed by 1.1–1.2 ms and request transport increased. That experiment is not included in production. Production Scene/Game scheduling and image quality are unchanged.

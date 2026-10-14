# Sparse viewport camera transforms

Author: MiYu

Camera previews and Timeline camera selection resolve only their camera and ancestor transforms. These queries now scan for at most four requested entity IDs before creating a complete entity index. Reverse lookup preserves duplicate-ID last-record semantics. Deeper hierarchies use the same indexed resolver, transform composition, active-state propagation and cycle handling. Full-world rendering still resolves the full world. Selecting an object without exactly one Camera component returns without resolving transforms.

The lookup is local to each call. Mutable edits are read again, and the requested-world versus displayed-frame ownership boundary is unchanged. No browser/native protocol, scripting VM or runtime camera convention changes.

Validation: 49 camera, world-transform, native-frame and presentation tests pass. A separate comparison against committed `123fa37` passes 1,800 cases over 300 generated worlds, including cycles, duplicate IDs, missing parents, absent transforms, multiple roots and NaN IDs. TypeScript and production frontend build pass. Build the embedded Release consumer with `npm.cmd --prefix packages/editor run build` followed by `cargo build --release -p mengine-editor-tauri --features custom-protocol`.

## Release-host measurements

Both production frontend runs use the same Release host `123fa37`, frozen Frost fixture `3098765`, 2560×1440 editor, requested 1920×1080 Game output rendered at 1225×689, and 4× MSAA. An owned background editor has WebView throttling disabled. Each stage samples 10 seconds of browser CPU at 1 ms; compilation and other benchmarks run separately.

| Stage | Game mean before → after | Game P95 before → after | Selected-camera inclusive sampled CPU before → after |
| --- | --- | --- | --- |
| Scene + Game + preview | 20.65 → 20.46 ms | 32.1 → 28.7 ms | 292.4 → 78.7 ms |
| Scene + Game | 20.12 → 19.96 ms | 30.7 → 29.5 ms | inactive |
| Game | 18.90 → 19.11 ms | 24.0 → 23.4 ms | inactive |
| Game, Profiler hidden | 18.57 → 18.97 ms | 23.4 → 23.8 ms | inactive |
| Scene + Game + preview repeated | 21.44 → 20.42 ms | 33.2 → 31.1 ms | 286.9 → 90.9 ms |

Selected-camera sampled CPU falls by 68–73% in the two preview stages. Timeline camera sampled CPU falls from 155.9/167.7/194.1/192.9/150.9 ms to 100.3/121.6/124.4/137.1/107.4 ms across the five stages. These totals include child calls over each ten-second window; they are not exact per-frame timings. Overall frame intervals remain variable, including small regressions in Game-only stages. This is evidence of reduced camera-query CPU, not a universal FPS improvement or resolution of the user's remote 200 ms complaint.

All five candidate stages record zero long tasks and zero console errors. Scene and camera-preview alternating render differences are 154/230400 and 60/57600 pixels within the existing animation tolerance. After screenshots, the next second produces 52 Scene and 50 Game frames. The screenshot was inspected and the owned editor exited normally.

## Complexity and remaining work

Sparse queries avoid allocating an index of every scenery entity for shallow camera chains. They still scan entity records; this is not constant-time lookup. After four individual lookups, subsequent unresolved IDs use the complete index. A 20,000-entity microbenchmark has median root/one-parent queries of 0.011/0.034 ms versus 0.898/0.876 ms, while a 20-parent query increases from 0.900 to 0.971 ms. These are isolated query measurements, not viewport FPS.

The editor still presents native rendering through GPU readback, CPU shared memory and Canvas. Direct native panel presentation, overlay/input integration and diagnosis of the separate native swapchain acquisition wait remain unfinished.

Evidence and exact sampled values are in `viewport-camera-queries.json`. Local runners: `D:/MEngineNativeQA/profile-local-frontend.mjs`, `verify-sparse-transform-equivalence.mjs`, and `bench-sparse-camera.mjs`.

The final embedded Release build passes in 4m24s with the existing unused-function warning. Its separate packaged-EXE run passes without frontend interception: Game/Scene captures take 300/270 ms, the next second produces 50 Game / 54 Scene frames, and alternating-view pixel differences are 131/230400 and 59/57600. Console errors are zero, the screenshot was inspected, and the owned process exits normally. This short acceptance run validates the packaged consumer, not sustained FPS. EXE SHA256: `CB75AE9F3A6026E73657561521F09CF4F620B8A5F1CBFB9B5BAC7682D6DD6051`.

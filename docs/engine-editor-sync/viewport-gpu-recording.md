# Live GPU recording controls

Author: MiYu

Profiler > GPU exposes **Record GPU timings** independently for Game and Scene. Settings are shared across editor windows for the current process; the legacy MENGINE_GPU_TIMINGS=1 environment setting initializes both sources. Supported timestamp features are negotiated when creating the render device. Query and staging resources are created only while recording and released between completed frames when recording stops. Unsupported adapters continue rendering without timestamps.

Settings carry a monotonic revision. Delayed reads/events cannot restore older UI state. A recording change refreshes paused Game frames without invalidating the displayed image or advancing the simulated world. Camera previews use the Scene setting. Historical GPU rows describe the selected frame, while the checkbox controls new frames. Hardware pass durations overlap CPU work and GPU map wait and must not be added to CPU totals. Nested scene-view passes remain outside the main-viewport GPU sample.

## Release acceptance

The packaged EXE runs its embedded frontend, with the frozen Frost fixture 3098765, Scene + Game + camera preview visible, 2560 x 1440 editor, requested 1920 x 1080 Game output presented at 1225 x 689, and 4x MSAA. Five ten-second stages exercise both sources disabled, Game enabled, both enabled, Scene enabled, then both disabled. All 5,006 sampled source frames have the expected supported/enabled state and presence or absence of GPU timestamps. Paused Game refreshes once on enable and once on disable; the world snapshot remains unchanged.

| Recording stage | Game presented mean (ms) | Game presented P95 (ms) | Game native mean (ms) | Scene native mean (ms) |
| --- | ---: | ---: | ---: | ---: |
| gpu-off | 21.81 | 34.60 | 8.68 | 5.21 |
| gpu-game-on | 21.42 | 32.60 | 8.69 | 5.26 |
| gpu-both-on | 20.87 | 32.20 | 8.66 | 5.21 |
| gpu-scene-only | 21.16 | 32.00 | 8.66 | 5.26 |
| gpu-off-again | 21.66 | 35.00 | 8.74 | 5.21 |

With both sources enabled, Game GPU passes average 2.074 ms, including 1.663 ms Forward HDR and 0.128 ms texture copy. Scene GPU passes average 1.300 ms. Native means stay around 8.66-8.74 ms Game and 5.21-5.26 ms Scene across the sequence. This single sequential run shows no material observed recording overhead; it is not a precise overhead bound or evidence of increased FPS. Browser CPU sampling and QA instrumentation are active in every stage.

All stages have zero browser long tasks and the console has zero errors. Game/Scene captures take 329/261 ms; the following second produces 53 Game / 54 Scene frames. Alternating Scene/preview differences are 173/230400 and 65/57600 pixels within the existing animation tolerance. The GPU panel screenshot was inspected. The owned editor exits normally; a runtime-directory EPERM during cleanup leaves diagnostic files in the owned QA directory.

Validation: 37 frontend tests, 7 real-GPU RHI tests, 1 native settings test and 5 host viewport tests pass; one existing resource-report experiment is explicitly ignored. Tests cover supported-feature fallback, timestamp decoding, pixel equality across resource toggles, optional pass reset, independent source flags and stale settings revisions. QuickJS host checking and TypeScript/production frontend compilation pass. Build the packaged consumer with `cargo build --release -p mengine-editor-tauri --features custom-protocol` after the frontend build. This changes no scripting semantics or network protocol.

The header's text-input style excludes checkboxes and the recording label stays on one line. Full acceptance and final packaged-consumer evidence are recorded in `viewport-gpu-recording.json`.

## Architecture scope

The editor still presents native frames through GPU readback, CPU shared memory and Canvas upload. These controls make GPU execution observable; they do not remove that boundary. The reported remote screenshot's approximately 21 ms native rendering versus 181 ms presentation / 177 ms WebView interval remains unresolved. Native panel integration and the separate native-surface acquisition wait still require investigation. The sampled GPU durations on this machine cannot establish the GPU cost on the user's other machine.

The final packaged consumer passes the five recording states again in two-second regression stages after the header layout adjustment. Checkbox dimensions are 13 x 13 pixels; its label occupies one line. Paused enable/disable, screenshots, alternating viewport pixels, zero console errors and normal owned-process exit pass. The next second after capture produces 46 Game / 52 Scene frames. Its screenshot was inspected. Final Release build takes 4m36s with the existing unused-function warning. EXE SHA256: `5B03F8ACEB1CF05A3EE6D40F9D5B8E3EC8493C44E71D9568B1E2946B2D1E47AE`. The independent release directory contains matching EXE/DLL/resources and preserves the earlier user test build.

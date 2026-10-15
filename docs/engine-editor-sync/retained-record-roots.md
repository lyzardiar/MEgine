# Retained Play record roots

Native Play publications retain independent JSON copies and deep-freeze every object and array before exposing a frame. Only each explicitly retained root is registered in the ownership WeakSet. Nested components remain immutable but do not become independent certified records. Existing entity reuse, editable store copies, hierarchy normalization and event-journal signature caches all query entity roots.

The private recursive traversal operates only on fresh JSON.parse trees. Arrays use numeric indices, objects use own keys, and primitive children need no recursive call. All five retention entry points already supply fresh JSON copies; previously retained entity roots bypass conversion above this function. The JSON stringify/parse boundary retains normal serialization, special-key handling and input isolation. Object.isFrozen alone never certifies a caller-provided record.

The exported internal helper cloneRetainedPlayRecord now explicitly accepts certified roots. Passing entity.components is rejected; no repository consumer uses that pattern. This is an intentional narrowing of the previous incidental nested certification, covered by tests. Deep freezing and the event-journal checks for prototype serialization hooks remain required.

## Validation

61 tests passed across Play world synchronization, native ownership, runtime lifecycle, retained patches, native presentation and event journal. Coverage includes full and incremental capture, historical frames, mutable aliases during pending steps, ID reuse, resets, serialization hooks, special keys, complete deep freezing and rejection of uncertified nested nodes. Independent read-only review found no blocker after checking every retention entry and marker consumer.

The reproducible benchmark is scripts/benchmark-retained-world.mjs. It accepts an optional native QA report containing endWorld or generates 5,000 transform/material entities. Thirty alternating measured runs follow four warmups and assert normalized value equality against the prior implementation. On the captured 5,006-entity Frostbound world, complete normalization/copy/freezing median was 48.96355 -> 19.5644 ms, P95 142.6494 -> 43.1996 ms. Garbage collection is included in these measurements. This is a CPU microbenchmark, not editor FPS.

## Native acceptance

Release custom-protocol editor built in 5m31s after the frontend type/build check passed. The release profile uses full LTO and one codegen unit; no runtime/player source changed. Package: D:/MEngineNativeQA/releases/editor-retained-roots-20261015/mengine-editor-tauri.exe, with the unchanged validated V8 Release/Debug players and SDK reused from editor-frame-source-checks-20261015.

Both native workflows passed authored/play title parity, custom map entry, simultaneous Scene/Game, Profiler CPU/Memory/Resources, frozen history, Live resume and Stop. Zero console errors, normal exit and fixture restoration confirmed. The live screenshot was inspected. Temporary WebView runtime cleanup returned EPERM and those directories remain.

CPU report: D:/MEngineNativeQA/rpg-multiview-retained-roots-after-1792078631676/report.json. Over 12.34 seconds, freezeJsonTree plus freezeJson sampled self time was 113.279 ms versus 375.935 ms in the preceding 12.30-second run. GC was 454.316 versus 512.65 ms. On the 5,006-entity benchmark snapshot, retained marker registrations decrease from 55,211 to 5,008 while the same nested objects stay frozen. Source symbols were verified against the actual bundles (previous fn, current Fr/kn).

The CPU probe measured 336.6 ms from requesting Profiler.start to the following browser ready observation. Its largest raw Game/Scene presentation intervals (373.4/352 ms) overlap that boundary. They remain in the evidence; do not treat those startup intervals as isolated rendering cost. The attempted invoke wrapper again captured zero calls and supplies no RTT evidence.

Without live CPU sampling, D:/MEngineNativeQA/rpg-multiview-retained-roots-no-live-cpu-1792078755827/report.json recorded Game median/P95/max 33.6/64.9/116.7 ms (327 samples), Scene 31.3/44.6/107.7 ms (365 samples). The previous equivalent run recorded Game 34.2/66.6/131.5 and Scene 30.85/46.6/113.2. Separate observational runs do not establish a controlled FPS gain, and long-frame repair remains incomplete.

Remaining evidence: the longest Game presentation (revision 574) had native render 22.9148 ms, command 26.4597 ms, simulation 10.9311 ms and simulation request 89.7 ms. Separately, the largest native Game rendering sample (revision 559, 64.9896 ms) spent 44.5589 ms self time in Renderer.submit_frame_to. Scene revision 376 (57.0924 ms native, 107.7 ms presentation) spent 41.8355 ms in Mesh vertex conversion and GPU upload across 17 calls. These are measured CPU-side scope durations, not proof of GPU execution cost. Next work should split those conversion/upload/submission paths and retain snapshot/transport attribution. Full Warcraft parity and the original stall investigation remain active.

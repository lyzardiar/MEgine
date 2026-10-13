# Viewport resource profiling

Author: MiYu

## Scope

The reported screenshot has about 21 ms native rendering, 181 ms completed-frame interval and 177 ms WebView frame interval. These are different clocks. The native rendering value alone cannot explain the visible delay. Queueing, world locks, renderer locks, GPU readback and WebView delivery must remain separately observable.

Scene, Game and Camera Preview retain independent render targets and caches after the multiview fix in `7d18f18`. That change reduced the local repeated multiview Game interval from 47.5 to 27.3 ms and world-lock p95 from 72.1 to 5.4 ms. See `multiview-preview-performance.md` for its inputs, raw evidence and limits.

## Background resource metadata

The resource profiler collects in-memory references at most every 250 ms. File metadata and texture headers are read by one process-wide worker outside the world and renderer locks. Each viewport has at most one outstanding request, and the shared queue holds at most eight waiting requests. The render path never waits for a worker result or queue space.

Reference collection examines at most 4,096 batch/object entries, retains at most 256 sorted resources and marks partial lists as truncated. Material texture slots have a fixed-size array. The resource list describes the last completed sample, not the current frame. Until a sample is ready, the UI shows pending metadata instead of a zero resource count. Sample age and worker duration are shown separately; background duration is excluded from the frame CPU call tree.

Queue saturation retains the last sample and retries at the sampling interval. Waiting for queue space or metadata for more than two seconds is reported as delayed. Worker failure reports unavailable. OS file reads cannot be forcibly interrupted; the thread and queue bounds prevent blocked reads from creating unbounded worker threads or requests.

Project open/close invalidates resource samples. Every render entry captures the generation while holding the same project lock used to capture its root/world. Game, Scene, Camera Preview, material preview and Effekseer preview pass that generation to the sampler. Late requests cannot reset a newer sampler generation or publish old results under a new session, including reopening the same project path.

## Validation

Rust viewport tests cover slow metadata, bounded queue saturation and recovery, missing workers, generation invalidation, late same-root requests, reference caps, normalized aliases, and changed/missing/recovered texture dimensions. The texture cache keeps only the current sample's resources. Frontend tests cover pending, retained, delayed, unavailable and legacy sample status.

Release comparison uses the same RPG scene/script at `3098765`, 2560×1440 host viewport, 1920×1080 Game request and 4×MSAA. Five ten-second stages cover simultaneous Scene/Game/Camera Preview, removal of the preview, Game alone, Profiler hidden, and restored multiview. Compilation is complete before measurement. The run also compares alternating Scene/Preview pixels and checks the native console and resource metadata.

Use `node scripts/summarize-viewport-resource-profile.mjs <before-root> <after-root> <output.json>` to summarize saved captures without loading their full content into a conversation. Results are recorded in `viewport-resource-sampling.json`.

## Results

The repeated multiview stage produced the following local before/after measurements:

| Metric | Before | After |
|---|---:|---:|
| Profiler snapshot mean | 0.635 ms | 0.099 ms |
| Profiler snapshot p95 | 4.977 ms | 0.261 ms |
| Game native rendering mean | 8.673 ms | 8.313 ms |
| Game native command p95 | 18.100 ms | 15.140 ms |
| Game completed-frame interval mean | 26.676 ms | 26.840 ms |
| Game completed-frame interval p95 | 43.900 ms | 43.100 ms |

The first multiview stage measured 26.736 → 25.908 ms mean completed-frame interval. These short runs establish a substantial reduction in profiling overhead, but no consistent whole-frame throughput improvement. The repeated stage's mean interval slightly increased. Single-Game Profiler shown/hidden intervals were 18.655/18.472 ms after the change.

Across 3,878 sampled native frames, all resource samples were ready after warmup, with zero delayed or unavailable reports and no synchronous metadata nodes in the CPU call trees. The final resource check returned 225 entries with valid source bytes and texture dimensions. Worker durations in the summary are cached values observed per frame, not independent worker-job samples.

All five runtime stages passed. Alternating Scene/Preview changed 147/230,400 and 59/57,600 pixels respectively, below the 0.5% tolerance. Native console error count was zero. The owned QA editor exited normally; its isolated runtime directory remained because cleanup encountered a Windows permission error.

Rust: 10 passed, 0 failed, 1 optional metadata microbenchmark ignored. Frontend Profiler: 13 passed, 0 failed. Release web and custom-protocol native builds succeeded. Independent review found no blocking issues.

Raw captures: `D:/MEngineNativeQA/rpg-multiview-resource-before-1791919571645` and `D:/MEngineNativeQA/rpg-multiview-resource-after-1791921554807`.

## Remaining rendering work

The display path still performs GPU readback into CPU pixels followed by shared-buffer delivery and WebView texture upload. The current shared buffer removes IPC serialization of pixel arrays; it does not remove GPU-to-CPU synchronization or the subsequent upload. Further work should measure this boundary and evaluate asynchronous readback or GPU-native presentation while preserving frame ownership, picking, camera revisions and resize behavior.

This change removes filesystem work from the renderer's critical section. It does not establish a 60 FPS guarantee or reproduce the user's other computer's 200 ms frame interval. Resource memory figures remain logical estimates rather than driver-reported residency. Gameplay simulation and network state synchronization are unchanged.

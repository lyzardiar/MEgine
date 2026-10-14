# Canvas batch order reuse

Author: MiYu

Editor Scene/Game and the native player share a bounded Canvas batch-order cache through `FrameCompiler`. A frame with unchanged batch keys, rectangles, pivots, rotations and sorting-grid settings reuses its transparent-overlap ordering. Current colors, UVs, depths, vertex data and resolved material bindings still come from the current frame; final material batches are rebuilt every time. Geometry, clipping, Canvas membership, texture keys or list changes cause immediate recomputation. Cache misses reuse unchanged key strings, and scenes above 16,384 primitives use the uncached path.

Release CPU measurements use the same 4,259-entity authored scene with 2,264 UI primitives. Three alternating pairs of 80 measured frames per path compare a persistent cache with `FrameCompiler`'s uncached path. Static UI batching median falls from 1.2518 to 0.3708 ms; total compilation falls from 5.4107 to 4.5074 ms. With an active UI image moved every frame, total compilation is 5.5719 versus 5.5802 ms, while batching is 1.2776 versus 1.3098 ms. These are CPU extraction timings, not gameplay FPS or physical display latency.

Cached and uncached complete-frame SHA-256 hashes agree for both fixtures, including camera, lighting, meshes, primitives, control regions, embedded scene views and resource failures. Twenty-one RHI/UI tests pass, including live color/UV/material changes, every overlap-input category, scene replacement and the cache size limit. Exact measurements and native acceptance are recorded in `ui-batch-order-cache.json`.

Reproduce the CPU comparison with the Release `benchmark_frame_compile` example, providing a complete sample project and an iteration count. Append `--uncached-ui-order` for the control path and `--animate-ui` for the changing-layout fixture. The benchmark does not execute scripts, GPU rendering, IPC or desktop composition. Editor and player delivery retain V8.

The packaged Release editor passes native Scene/Game navigation, viewport continuity, cache-eviction recovery and zero-console-error checks. Seven Game samples average 11.534 ms native render and 20.471 ms request-to-Canvas-upload. The latter stops at the intermediate Canvas upload, before final viewport compositing and physical scanout. The initial bridge query timed out; its cause remains unconfirmed, while an independent startup diagnostic and complete retry passed. QA processes exited normally; some temporary WebView cache files remain locked.

The cache currently retains one whole input sequence per renderer. Changes to animated world primitives can therefore invalidate the plan even when overlay UI stays static; the CPU-only static benchmark is not a promise of the same percentage improvement during gameplay.

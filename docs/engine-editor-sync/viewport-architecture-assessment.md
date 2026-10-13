# Viewport frame delivery and Profiler assessment

Author: MiYu

## Finding

The current viewport delivery path still needs architectural work. Rendering to a GPU target, reading pixels back to CPU memory, publishing shared memory and uploading into a WebView Canvas adds synchronization and scheduling dependencies to every completed frame. Buffer reuse reduces allocation and copying costs, but does not remove GPU readback, browser composition or contention among Scene, Game and the selected-camera preview.

The user's screenshot reports 21.2 ms native render, 181.1 ms completed-frame interval and 177.4 ms WebView interval. Those measurements do not establish that geometry rendering consumed 181.1 ms, nor that subtracting native render from the interval gives a single identifiable wait. The approximately 200 ms failure on the other machine remains unresolved. Our hidden, unfocused Release QA is a controlled local comparison and is not a reproduction of that machine's foreground behavior.

## Profiler refresh experiment

Engine `dcdad497402235558ae5f851364b942136720b66`, fixed scene/script `3098765`, Scene + Game + selected-camera preview + Profiler. One owned process, 1.5 seconds warmup and 8 seconds measurement per group, with background throttling disabled. Only `document.hasFocus()` was overridden to select the existing Profiler UI refresh policy; the native window remained unfocused. No CPU sampling or Chromium trace ran during these groups.

| Policy | Game mean / P95 completion interval | Scene mean completion interval | WebView mean rAF interval |
| --- | --- | --- | --- |
| Unfocused, 1 Hz | 22.214 / 35.500 ms | 20.019 ms | 17.932 ms |
| Focused, 4 Hz | 22.099 / 35.500 ms | 20.140 ms | 17.967 ms |
| Focused, 4 Hz repeat | 22.128 / 34.200 ms | 20.282 ms | 17.967 ms |
| Unfocused, 1 Hz repeat | 22.002 / 36.100 ms | 20.115 ms | 17.966 ms |

The hook was called 787-793 times per group. Every group produced more than 350 Game frames and had zero browser long tasks. Console errors were zero; the owned editor exited normally. Windows denied removal of its isolated runtime directory, which was retained.

This short repeated comparison found no material cadence difference between the two UI refresh policies. It does not establish that Profiler recording is free: both groups still collect native profiles. DOM mutation counts are not publish counts because unrelated component updates also mutate the panel. These intervals measure completion and browser callbacks, not physical display scanout. The mean and P95 still exceed a 16.7 ms frame budget.

Compact evidence: `viewport-profiler-focus.json`. Raw report: `D:/MEngineNativeQA/rpg-multiview-profiler-focus-1791928699756/report.json`. Experiment runner: `D:/MEngineNativeQA/profile-profiler-focus.mjs`.

## Remaining costs and priorities

1. Use the existing request-stage breakdown to identify an actual slow frame before attributing the unexplained delay. Worker queue, world lock, world synchronization, renderer lock, native command, shared-buffer publication and browser receipt need correlated evidence. GPU timestamp scopes overlap CPU waits and must not be added to them. Keep trace-enabled measurements separate from acceptance: the earlier Chromium trace increased mean completion interval from 22.854 to 24.119 ms.
2. Reduce repeated work across views. The delivered selection-handle change reuses the same frame's world transforms and improved repeated selected-camera multiview means from 25.452/25.937 to 23.134/23.436 ms. Current CPU samples still contain world-transform resolution and text measurement. Any persistent cache must honor live edits, project changes and asynchronous font loading; those changes have not been implemented or validated by this experiment.
3. Measure recording overhead independently from panel refresh. `appendNativeProfile` still clones a frame and broadcasts it, including retained resource metadata, for every native profile. Panel visibility does not disable collection. A recording-on/off comparison should preserve viewport scheduling and rendering behavior. Subsequent changes must preserve history isolation and detached-window profiling.
4. Prototype GPU presentation that avoids CPU readback for ordinary interactive frames, keeping readback available for captures. A native surface or supported shared-texture integration needs a feasibility and correctness test against this Tauri/WebView2/wgpu stack. Required behavior includes docking, resizing, clipping, gizmos and overlays, input, DPI, detached windows, device loss and screenshot capture. This is an architectural direction, not a delivered implementation or a guaranteed speedup.

Acceptance must compare complete frame cadence, tail latency and camera movement on the same inputs and quality settings. A faster render function or cheaper profiler snapshot alone is insufficient. General engine changes continue to be synchronized to `master` and `codex/frostbound-realms`; browser and native behavior both remain part of validation.

See `viewport-handle-transforms.md`, `viewport-shared-mapping.md`, `viewport-buffer-capacity.md` and `viewport-resource-sampling.md` for already delivered changes and their individual validation limits.

# Native viewport submission and presentation diagnostics

Author: MiYu

The editor screenshot separates 21.2 ms native rendering from a 181.1 ms completed-frame interval and a 177.4 ms WebView interval. Those scopes are not additive. They identify substantial work or waiting outside the native render command, but do not identify the remote machine's bottleneck.

## Shared rendering contract

`EditorViewportRenderer::new_for_window` uses the same frame compiler, resource caches, scene passes and UI rendering as captured editor views. `present_game` submits directly to its owned winit surface and returns dimensions and a profile without CPU pixels. It does not create an offscreen color target or map a readback buffer. `present_game_with_capture` renders a new frame, copies that exact swapchain image, presents it and reads the copy. Surface capture requires COPY_SRC support and matching dimensions/format.

The existing headless editor views still use `render_game` / `render_scene`. The Tauri panels have not been switched to native surfaces. Child-window lifetime, panel clipping and DPI, Canvas overlays, input, camera preview, visibility scheduling, device recovery and multi-viewport integration remain required work. This capability is not an editor FPS fix by itself.

## Profiler scope

`Renderer.submit_frame_to` now reports CPU wall time for surface acquisition, encoder finish plus queue submission, and surface presentation. Counts and times accumulate across embedded scene views and the main view, and reset for each frame submission. Readback remains a separate stage. These measurements include API/driver waiting; they do not report GPU execution or physical scanout. Ordinary direct presentation reports no completed GPU timestamp profile because no query results have been read.

GPU memory categories use the actual retained offscreen target size and the configured surface size independently. Surface memory is a lower bound for one image, excluding additional swapchain buffers and driver padding. Scene depth is shared by both output paths. After an explicit capture, cached offscreen and staging allocations can remain resident even when the next frame performs no readback. The CPU RGBA size and readback stage describe that frame's transfer; retained GPU memory describes residency.

## Reproducible probe

Build `cargo build --release -p mengine-editor-host --example viewport_surface_probe`, then run `viewport_surface_probe <Frost project root> <output directory> [--hidden] [--frames=180]`. The probe starts Play, enters RPG with F8, freezes one world snapshot, and uses it for both output paths. Each mode warms up for 30 frames, then records CPU call wall time. The returned surface frame can still be queued; this is not an equal-latency end-to-end FPS comparison.

Acceptance covers zero dimensions, headless misuse, actual window resize 1225×689 → 777×433 → 1225×689, surface/offscreen image differences below 0.5%, a 319×177 capture interleaved with window presentation, and accurate memory dimensions. PNG captures and JSON profiles are emitted. The short frame-count option is for regression diagnostics, not a replacement for sustained foreground performance measurement.

The initial 180-frame visible-window run measured 6.958 ms mean / 7.585 ms P95 for readback and 1008.094 ms mean / 1009.050 ms P95 for native window submission. A hidden run showed the same approximately one-second wait. Both passed pixel and resize checks. Requested window visibility did not establish foreground compositor/scanout behavior in this execution session; these results cannot support a native-presentation speedup claim or explain the separate remote 200 ms failure. Submission diagnostics isolate the API consuming this time without attributing it to scene complexity.

Targeted validation: three RHI readback recovery/ownership tests pass; the live scene-view test passes with added submission-count/reset and zero-surface-wait assertions; five host viewport tests pass, with one resource-report experiment explicitly ignored; the host compiles with `--no-default-features --features quickjs-runtime`. V8 and QuickJS consume the same rendering path. This does not establish gameplay determinism between VMs.

The final Release editor and probe build passes in 5m22s. The instrumented 12-frame probe passes all pixel, resize, memory and recovery assertions. Its last sampled surface frame spends 1000.170 ms acquiring the surface, 0.187 ms finishing/submitting two command buffers, and 0.340 ms presenting. Thus the one-second stall in this probe is localized to surface acquisition. The Windows DX12 backend waits on the swapchain frame-latency signal in that call. The result does not establish why that signal is delayed in this desktop session, and does not identify the remote WebView's 200 ms cause. It rules out treating this probe's one second as scene draw cost. No compositor tuning or presentation-mode change is applied based on this environment-limited result.

The final packaged Release editor also passes the owned dual-view smoke with its embedded frontend: Game and Scene capture, 50 Game / 53 Scene frames in the following second, and alternating Scene/preview pixel differences of 160/230400 and 57/57600. No console errors were recorded and the screenshot was inspected. The two-second sample averages 23.67 ms Game and 21.34 ms Scene completed-frame intervals; it is regression evidence, not a sustained foreground performance comparison or acceptance of the remote failure. The owned editor exits normally. Measurements, scope and evidence paths are recorded in `viewport-native-presentation.json`.

# Owned native viewport surfaces

Author: MiYu

RHI and editor host accept a safe owned SurfaceTarget in addition to the existing winit window constructor. The surface retains the target until GPU surface teardown. A child-window target must retain its parent and arrange window operations on its event-loop thread. No raw-handle surface constructor or unsafe Send/Sync implementation is introduced.

The Windows surface probe supports --child and wraps its child and parent in one owned target. It records observed visibility, minimized state, physical dimensions and scale, checks hide/show, and confirms that the surface retains the Rust owner after the caller releases it and releases it when the surface drops. winit posts native destruction messages, so the weak-reference assertions prove Rust ownership release, not completion of native HWND destruction.

Release acceptance uses the fixed Frost Play world, 30 warmup frames and 30 measured frames per path. Direct child surface calls average 16.620 ms (P95 17.650 ms) with Fifo pacing; headless rendering plus readback averages 7.796 ms (P95 8.469 ms). These wall times include different pacing and are not an end-to-end performance comparison. Direct presentation allocates no pixel readback or offscreen color target. Three window sizes, on-demand capture, subsequent direct presentation and headless rejection checks pass. Surface/offscreen comparisons differ by 55/844025, 19/336441 and 45/844025 pixels, within the existing animation tolerance.

Five host tests pass and one existing resource experiment is ignored. The example check, QuickJS host check and Tauri check pass; Release probe build passes in four minutes. Exact report fields are in viewport-owned-surfaces.json.

The unchanged previous probe now measures approximately 16.8 ms visible and 16.6 ms hidden in this desktop session; its former approximately one-second acquisition delay was not reproduced. wgpu-core passes a 1000 ms acquisition timeout; the DX12 HAL discards the boolean result from its frame-latency wait. No dependency, vsync or timeout behavior is changed without observing the native wait result.

Production Tauri viewports still use readback and Canvas. The current ordinary WebView HWND does not provide an existing composition path for placing a GPU child beneath Canvas overlays, and an upper child would cover overlays and intercept input. This capability does not establish Tauri embedding, physical scanout, input parity, device recovery or resolution of the user's remote 200 ms report.

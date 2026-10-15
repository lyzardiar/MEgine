# Native render CPU stage attribution

Mesh uploads expose child scopes for CPU vertex conversion, vertex-buffer allocation/upload, index-buffer allocation/upload and local bounds calculation. The existing aggregate Mesh vertex conversion and GPU upload scope remains, including registration and temporary vertex cleanup. Buffer creation scopes measure CPU wall time inside wgpu, including possible driver waits; they do not report GPU execution time.

Renderer.submit_frame_to exposes target preparation, camera uniform writes, visibility culling/sorting, object uniforms, UI preparation, material preparation, encoder setup/shadow encoding, world encoding, postprocess encoding and UI encoding. Durations accumulate across the main view and embedded views. Existing surface acquisition, encoder finish/queue submission and surface presentation timings remain separate. Counts use completed queue submissions. Embedded target/cache creation, target swaps, capture copies, query resolve and temporary cleanup remain in the enclosing remainder.

Rendering, resource creation, sorting, buffer contents and cache behavior are unchanged. The original MeshGpu::upload and Renderer::upload_gltf_static APIs keep their return types; profiled variants supply the measurements used by runtime mesh synchronization. This milestone improves attribution for remaining long frames; it does not itself claim a rendering speedup.

## Validation

The headless multi-view pixel regression also checks finite nonnegative stage durations, elapsed-time containment, main/embedded accumulation, resize, camera movement and independent preview contents. The runtime multi-camera pose dependency regression checks upload substage containment across three camera-specific uploads. Native Release validation records the stage presence and timing containment on the actual Frostbound scene.

## Native Release evidence (2026-10-16)

Release and Debug players rebuilt; SDK refreshed with matching V8 backend identities. Library tests: 351 passed, 0 failed, 4 ignored. Native report: `D:/MEngineNativeQA/rpg-multiview-render-stage-timings-after-1792080565368/report.json`. Project/menu/play/UI parity, Scene/Game views, CPU/Memory/Resources panels, frozen history, Live and Stop passed; zero console errors, normal exit, fixture restored. Live screenshot inspected.

All 14 new scopes appeared. Recursive child timings stayed within enclosing scopes (0.01 ms tolerance). Live profiles contain 413 Game and 440 Scene samples. Presentation median/P95/max: Game 25.8/50.2/144.6 ms; Scene 25.85/36.9/119.4 ms. These are observational, with no live CPU sampler, and do not establish a speedup. Loading and warmup include intentional paused/step intervals and are not steady-state FPS measurements.

Concrete spikes:
- Game warmup revision 257: mesh upload 54.685 ms, of which index buffer creation was 54.5103 ms.
- Scene live revision 448: mesh upload 44.1991 ms, of which vertex buffer creation was 44.0291 ms.
- Live revision 686: UI batch preparation 36.5228 ms (Game) and 37.5155 ms (Scene).
- First material use during loading revision 1: material preparation 1316.6014 ms (Game) and 1322.3736 ms (Scene); this includes synchronous shader/pipeline and material resource preparation, requiring separate follow-up from steady-state rendering.

Native profile publication structured-clone path was not invoked; BroadcastChannel postMessage CPU median/P95/max 0.2/0.3/0.9 ms. Detailed profile snapshot costs and stage distributions are in `render-stage-timings-native.json`. This evidence directs follow-up toward resource allocation and UI/material preparation; it does not attribute these CPU API waits to GPU execution.

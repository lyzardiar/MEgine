# Measured mesh synchronization phases

`RuntimeMeshCache.sync` now reports file-metadata checks, source load/decode, pose/procedural geometry and vertex conversion/GPU upload as child spans. Each span includes its actual call count. Timers reset per synchronization and include nested camera preparation. No mesh data is copied for profiling, and no asset loading behavior is changed.

## Validation

Targeted runtime mesh tests: 10 passed. Editor-host viewport tests: 5 passed, 1 pre-existing ignored. Release editor plus Debug/Release V8 players rebuilt. Final native acceptance passed authored/play title parity, custom Dota map entry, live play, CPU/Memory/Resources history, frozen resources, Live resume and Stop; zero console errors. All four new phase names appeared. Across recorded loading, warmup and live profiles, child durations never exceeded their enclosing mesh-sync duration. Native editor exited normally and restored the owned fixture. Standalone player gameplay was not separately exercised.

Report: `D:/MEngineNativeQA/rpg-multiview-mesh-phases-after-1792068669942/report.json`.
Release: `D:/MEngineNativeQA/releases/editor-mesh-profile-20261015/mengine-editor-tauri.exe`.

## Findings

Map-entry revision 9: Game mesh sync 669.9544 ms, with 46 source loads/decode taking 574.1546 ms, geometry 85.5209 ms, uploads 4.2709 ms. Scene independently recorded 46 loads taking 703.2865 ms inside 800.0456 ms mesh sync. Viewport mesh caches each own their pose sources, so source reuse across views is an important next investigation.

During live play, Game mesh-sync median/P95/max was 3.1351/6.5699/22.8824 ms; Scene was 3.0283/6.1138/49.6030 ms. Scene revision 416 spent 43.1482 ms in upload. Revision 348 loaded two sources in 16.5518 ms (Game) and 18.3230 ms (Scene). The previous 180 ms live mesh spike did not reproduce in this run; that is not proof of a performance fix.

Other long frames remain: Game revision 599 presented after 657.9 ms with 624.7128 ms simulation, including 622.4713 ms script callback, while rendering was 22.4045 ms. The existing callback label says `QuickJS callback`; the shipped runtime identity is V8 15.2.124.1-rusty. That legacy label must not be interpreted as backend identification. Revision 406 spent 272.1454 ms in the `Camera, meshes and lighting` compile phase. Game presentation median/P95/max was 28.5/68.6/657.9 ms; Scene 26.6/43.2/278.8 ms. This is a diagnostic delivery, not evidence that stutters are solved or that instrumentation has zero overhead.

Source paths for follow-up: `mengine-script/src/asset_nodes.rs` canonicalizes root/model per node query and checks cached dependency stamps each frame; `mengine-runtime/src/sampled_effects.rs` synchronously loads model sources during frame compilation; `mengine-runtime/src/meshes.rs` owns sources per viewport. These paths need independent measurement before assigning the observed script/compile spikes to any one of them.

## Model loading probe

`cargo run -p mengine-assets --example benchmark_gltf_geometry --release -- <project-root> <json-array-of-model-paths>`

The 338 sources referenced by the accepted map snapshot all loaded, with matching vertex/index counts, and had zero image declarations. First-observed geometry loading totaled 2109.667 ms; repeated aggregate geometry measurements were approximately 163–173 ms. First versus repeated access was not a controlled cold-cache test. Skipping image import did not improve repeated measurements, so no loader behavior change is included. This evidence rules out redundant image decoding for this model set; it does not establish the OS, storage or parser contribution to the first-access difference.

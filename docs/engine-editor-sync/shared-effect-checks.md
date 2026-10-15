# Shared effect resource checks and script query timings

Sampled effect collection checks each distinct .mfx resource once per collection. Instances keep independent playback state and see resource changes on the next collection. Modified, deleted, invalid and restored resources retain the existing reload and diagnostic behavior.

A Release CPU benchmark creates 2,000 active instances sharing one effect, measures 60 frames after two warmups and hashes the complete generated primitive output. Two alternating before/after runs produced median-of-run-medians of 41.42125 ms and 1.367 ms (30.30x). All output hashes match. The executable example is crates/mengine-runtime/examples/benchmark_sampled_effects.rs; evidence is shared-effect-benchmark.json. These are synthetic CPU collection measurements, not gameplay FPS. The preceding native snapshot had two distinct active effect resources, so this improvement does not explain or resolve its long frame spikes.

FrameCompiler now separates Sampled effects and environment from Camera, meshes and lighting. ScriptTickProfile exports native asset-node query time and counts under Script callback, with load/decode, pose sampling and result serialization children. Query self time includes path validation, dependency checks, result-cache lookup and remaining overhead. Cached query results do not increment load/sample/serialization counts. Failed queries still count; profiles reset for each onTick invocation. The previous backend-specific callback label is now Script callback.

The node-query profile covers the onTick callback only. Collision, animation, timeline and scene-loaded callbacks remain in their existing stages and are not included in this query subtree. V8 and QuickJS use the same NativeBindings path; editor Play and standalone players share ScriptHost and FrameCompiler.

Validation: node-query tests 3 passed on V8 and 3 passed on QuickJS, including real ScriptHost profile export, callback containment and frame resets. Sampled effect tests 3 passed, including shared-resource playback independence and reload/delete/restore behavior. Editor play-runtime tests 23 passed with 3 pre-existing ignored. Independent read-only review found no blocker within the declared onTick timing scope.

## Native acceptance and remaining stalls

Report: D:/MEngineNativeQA/rpg-multiview-node-effect-phases-after-1792071096219/report.json. Acceptance passed authored/play title parity, custom Dota entry, live play, CPU/Memory/Resources panels, frozen resource history, Live resume and Stop. Zero console errors, normal editor process exit and fixture restoration were confirmed. The harness could not remove its temporary WebView runtime directory (EPERM); that directory is retained. The screenshot live-game.png was inspected. Standalone player gameplay was not separately tested.

All new timing names appeared. 3,024 callback/query nodes passed child-duration containment checks; 196 recorded viewport samples contained node queries (these are render samples, not distinct simulated frames). Detailed statistics are in node-effect-native.json.

Live Game revision 516: Script callback 311.9347 ms; Asset node queries 306.0011 ms for one query; source load/decode 305.3713 ms for one load. Presentation interval was 339.9 ms. This directly attributes this callback spike to synchronous pose-source loading. It does not establish whether parsing, storage or filesystem validation dominates inside that load.

Warmup Game revision 255: Camera, meshes and lighting 500.9483 ms versus Sampled effects and environment 0.0318 ms; presentation interval 554.9 ms. The former includes object extraction/material resolution and lighting; it needs further separation before attributing that spike. Another warmup mesh-sync spike at revision 280 was 369.3012 ms. Thus stutters remain and the synthetic effect speedup must not be presented as fixing the reported long frames.

Live Game medians/P95: script callback 6.963/13.320 ms; sampled effects 0.014/0.159 ms; mesh sync 3.257/6.910 ms. These are samples from this run, not a controlled overall FPS comparison with the previous run.

Release: D:/MEngineNativeQA/releases/editor-effect-profile-20261015/mengine-editor-tauri.exe. Release editor and Release/Debug players rebuilt together with V8 15.2.124.1-rusty, bridgeVersion 1. Final package commit identities and file hashes are in release.json.

Next work must address resource preparation during live frames: source reuse/preparation for script node queries and per-view mesh caches, plus material resolution attribution. Preserve project-boundary checks, dependency invalidation and bounded resource lifetime.

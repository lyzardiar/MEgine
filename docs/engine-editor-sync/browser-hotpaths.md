# Browser viewport CPU work

The editor resolves recurring sprite references through a bounded 2,048-entry cache. Each catalogue refresh invalidates resolved references and the exact-ID index, including failed refreshes and project changes. Exact paths, aliases, case handling, catalogue order and missing-reference fallback keep their existing lookup semantics.

World selection bounds use a transformed center and absolute rotation-matrix half extents. This computes the same AABB as transforming eight corners, including nonuniform/negative scale and non-unit quaternions, while creating fewer temporary vectors. Viewport frustum tests, octree membership and mesh picking still use full object bounds.

## Evidence and scope

A 12.22-second live browser CPU sample of the previous Release recorded 257.50 ms of resolveSpriteId self time and 168.44 ms of transformBounds self time. It also recorded 548.77 ms in garbage collection, 334.18 ms in freezeJson and 549.85 ms in Viewport paint. These are non-overlapping sampled self times aggregated across call sites, not inclusive timings or frame rates. The same harness exercises authored/play title parity, custom map entry, simultaneous Scene/Game, Profiler CPU/Memory/Resources panels, frozen resource history, Live resume and Stop.

The attempted invoke wrapper captured zero commands. It provides no invoke RTT evidence. Existing simulationRequestMs starts before input/snapshot preparation and ends after retained-world conversion and store acceptance. Native simulationMs already includes simulation step, snapshot export and delta construction. The difference can include queueing, serialization, browser scheduling and frontend processing; it cannot be labelled pure native wait. Native viewport command timing also ends before shared-buffer publication and browser delivery.

## Validation

The four targeted test files pass 23 tests, including 2,000 deterministic corner-oracle bounds comparisons and a 20,000-asset repeated-reference regression. Normalized/non-normalized rotation, signed/zero scale, invalid numbers, refresh failure, same-array catalogue replacement, project change and cache eviction are covered. Existing native presentation ownership, Scene transforms, octree and selection restoration tests pass.

Run `node scripts/benchmark-viewport-bounds.mjs` for the alternating 5,000-object CPU benchmark. In 60 measured iterations after warmup, equivalent results had median 4.12565 -> 0.81295 ms and P95 5.0078 -> 1.4408 ms. This benchmark measures one function, not editor FPS. Raw benchmark data is in browser-hotpaths-native.json.

## Live CPU and native acceptance

The new Release passed the full native workflow with zero console errors, normal exit and fixture restoration. Live screenshot inspected. Report: D:/MEngineNativeQA/rpg-multiview-browser-hotpaths-after-1792077329202/report.json. The previous CPU probe is D:/MEngineNativeQA/rpg-multiview-live-cpu-before-1792075966390/report.json. CPU profiles remain beside those reports.

Across approximately 12 seconds per run, resolveSpriteId sampled self time decreased 257.50 -> 5.019 ms and transformBounds 168.439 -> 65.988 ms. Garbage collection remained 512.65 ms and freezeJson 375.935 ms in the new run, identifying remaining browser work. Separate game sequences and cache state limit this comparison.

The sampled run's Game presentation median/P95/max was 37.1/69.0/361.3 ms; Scene was 32.9/47.4/312.2 ms. The largest samples occurred within 310 ms of requesting Profiler.start. Sampling startup interference is suspected; raw maxima are retained and must not be silently dropped. A separate run without live CPU sampling checks ordinary presentation behavior.

Release: D:/MEngineNativeQA/releases/editor-browser-hotpaths-20261015/mengine-editor-tauri.exe. Frontend type/build check passed and Release custom-protocol editor compiled in 6m17s, with one existing dead-code warning. Unchanged validated Release/Debug V8 players and SDK are reused from editor-frame-source-checks-20261015; both player hashes match that package. The new executable embeds the updated frontend bundles. No standalone-player rebuild or standalone gameplay acceptance is claimed for these editor-only changes.

## Presentation without live CPU sampling

D:/MEngineNativeQA/rpg-multiview-browser-hotpaths-no-live-cpu-1792077477478/report.json passed the same full native acceptance, zero console errors, normal exit and fixture restoration. Game presentation median/P95/max: 34.2/66.6/131.5 ms (320 samples); Scene: 30.85/46.6/113.2 ms (368 samples). Previous non-live-CPU run: Game 34.7/74.6/181.9 ms; Scene 31.8/46.9/166.5 ms. These remain observational runs, not a controlled frame-rate claim or proof that the reported 300 ms stalls are eliminated. WebView temporary runtime directory cleanup returned EPERM after normal exit; directories are retained.

Remaining long-frame evidence: Game revision 339 presented after 131.5 ms, native render 30.4472 ms, command 36.1651 ms, simulation 11.2915 ms, simulation request 111.3 ms and transport 43.7 ms. Scene revision 338 presented after 113.2 ms with native render 7.3484 ms, command 11.9758 ms, transport 99.4 ms and shared-buffer publication-ready-to-event 82.468 ms. Native UI queue 0.0421 ms and buffer copy 0.5822 ms do not explain that delivery interval. These overlapping durations must not be summed. Browser scheduling and snapshot processing need further attribution; full Warcraft parity and the broad stall repair remain incomplete.

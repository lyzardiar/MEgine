# Frame-local mesh source validation

RuntimeMeshCache shares one source-validation snapshot across its main camera, embedded scene views and final mesh synchronization. Each sync/sync_frame call owns its own file-stamp map and successful-source set. A source enters the set only after validation or a successful load. Existing 250 ms polling and new-pose checks remain; no validation result survives into another call. Missing dependency retry, ordinary/billboard attempt invalidation and render-only missing-image compatibility retain their behavior.

The Profiler exposes Mesh source validation separately from Mesh file metadata. Validation includes dependency canonicalization and metadata access previously charged to the mesh-sync remainder. Frame compilation now attributes Camera selection, Mesh objects and materials, and Scene lighting separately. The timing scopes only measure existing work; they do not add traversal or disable rendering.

## Validation

A headless GPU regression uses one source in a main camera plus two embedded camera views. A warm poll performs one source validation and one main-file metadata read, with zero uploads. Changing only its buffer refreshes all three camera meshes; deleting the buffer invalidates their attempts, and restoration retries successfully without modifying the glTF. The final mesh suite passed 14 tests. The broader runtime/editor-host suite passed 286 tests with 4 pre-existing ignored before the final scoped mesh adjustment. Independent read-only review found no blocker in the final diff.

A separate native diagnostic probe recorded the first script-node query path as Assets/WarcraftIII/Models/Buildings/NightElf/AncientProtector/AncientProtector/geoset-00-animated.glb (665,796 bytes). That run measured 4.8914 ms in source load/decode and did not reproduce the earlier 134 ms source-load spike. It identifies a queried asset, not the cause of the earlier spike. Diagnostic rows were persisted outside the query timing; do not use that probe for a frame-rate comparison. Its native workflow passed, exited normally and restored the fixture. Source-path evidence is node-source-path-evidence.json. The preceding diagnostic attempt failed only at an invalid console-log query limit and is not counted as an acceptance pass.

First-source loading is still synchronous. This milestone reduces repeated validation and improves attribution; it does not establish completion of the reported long-frame repair or Warcraft parity.

## Native acceptance

Report: D:/MEngineNativeQA/rpg-multiview-frame-source-checks-after-1792075436111/report.json. The unchanged native harness passed authored/play title parity, custom map entry, live play, CPU/Memory/Resources panels, frozen resource history, Live resume and Stop. Zero console errors, normal process exit and fixture restoration confirmed; live-game.png inspected. Temporary WebView runtime directory removal returned EPERM and the directory remains. All four new timing labels appeared; 4,994 callback/query/mesh-sync timing nodes passed child containment checks.

Live Game mesh-sync median/P95: 3.6205/9.7323 ms (previous run 3.6044/16.5968). Scene: 3.5486/9.3578 ms (previous 3.5243/16.044). These are separate observational runs with different event sequences and filesystem cache state; do not infer a controlled overall speedup. Game presentation median/P95/max is 34.7/74.6/181.9 ms; Scene is 31.8/46.9/166.5 ms. Overall P95 and maxima do not uniformly improve.

Live Game source validation median/P95 is 0.4698/4.6298 ms when the stage appears; its maximum is 6.7079 ms over 47 sources. Mesh objects/materials median/P95 is 1.4216/3.6243 ms; scene lighting is 0.0035/0.0045 ms. This run's first node-source load is 6.9329 ms, so the earlier 134 ms source-load spike was not reproduced.

The longest live Game presentation sample (revision 408, 181.9 ms) reports native render 23.7301 ms, native command 28.1366 ms, simulation work 18.4641 ms, simulation request 145.5 ms, and render transport 45.9 ms. Scene revision 559 reports presentation 166.5 ms, native render 12.2877 ms, command 14.3326 ms and transport 135.4 ms. These request/transport intervals include scheduling and delivery; they are not extra GPU execution time or independently additive stages. Next investigation must trace the simulation request and viewport transport path alongside the browser main thread, while retaining the unresolved first-load investigation. See frame-source-checks-native.json.

Release package: D:/MEngineNativeQA/releases/editor-frame-source-checks-20261015/mengine-editor-tauri.exe. Release editor/player and Debug player rebuilt; Build SDK refreshed; V8 identities match. Release build took 7m53s, Debug player 35s. Final commits and verified package hashes are recorded in release.json. Standalone gameplay was not separately exercised in this milestone.

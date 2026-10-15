# Shared validated pose sources

Script node queries, sampled model particles and runtime mesh caches share immutable decoded glTF sources within one process. The lookup key includes canonical project root and model path. Per-source locking coalesces concurrent loads; unrelated model decoding does not hold the global lookup lock. Weak entries do not retain unused source payloads. Camera-dependent geometry and animation state remain per consumer.

Project-scoped loading validates dependency boundaries, file size and timestamps across parsing/import. Changed or missing dependencies invalidate the source. Mesh caches clear all ordinary and billboard pose attempts, discard failed GPU geometry and retry restored dependencies. Rendering retains compatibility with missing images through a dependency-tracked render-only source, which never enters the strict script pool. Existing source-file budgets remain logical budgets, not decoded heap estimates.

Profiler source reuse has separate counts and spans from actual load/decode. Script timing remains scoped to onTick. The implementation is shared by V8 and QuickJS, editor Play and standalone players; standalone gameplay was not separately exercised in this milestone.

## Validation

The combined library suite passed 411 tests with 4 existing ignored before the final render-only dependency-list guard and billboard regression test. Final targeted mesh tests passed 13, and QuickJS node-query tests passed 3. Release editor, Release player, Debug player and Build SDK were rebuilt; package runtime identities agree on V8. Build logs retain an unused SystemTime import warning and the existing unused world_from_snapshot warning.

The Release example benchmark_shared_pose_sources reads 338 real Frostbound model paths for three consumers. Both repeated runs perform 1,014 independent decodes versus 338 shared decodes and 676 reuses, with equal sampled-node output. CPU acquisition totals are 1,355.8482/562.6085 ms and 1,352.8487/546.2019 ms (independent/shared). Independent reads precede shared reads for each asset; these are warm-cache CPU measurements, not controlled cold-start or gameplay FPS results. See shared-pose-benchmark.json.

Native report: D:/MEngineNativeQA/rpg-multiview-shared-pose-after-1792073417379/report.json. Authored/play title parity, custom map entry, live play, CPU/Memory/Resources panels, frozen resource history, Live resume and Stop passed. Zero console errors; normal process exit and fixture restoration confirmed. Temporary WebView runtime removal returned EPERM and its directory remains. The live-game.png screenshot was inspected. 3,216 callback/query nodes passed child-duration containment checks; 224 viewport samples contained node queries. Detailed data: shared-pose-native.json.

## Remaining frame stalls

Live Game presentation interval median/P95/max: 34.5/68.5/283.3 ms. The preceding run recorded 37.7/73.9/339.9 ms. These separate live runs are observational, with different frame sequences and filesystem cache state; they do not establish a controlled overall speedup. Scene median remains 32.4 ms.

Game revision 529 still spent 134.129 ms in one synchronous node-source decode (callback 144.0256 ms, presentation 283.3 ms). No script-source reuse occurred during this live window. Mesh-source reuse was observed in both views; warmup Game source reuse reached 23.2724 ms for three acquisitions, so validation overhead also needs attention. Live mesh-sync median/P95 is 3.6044/16.5968 ms, compared with 3.257/6.910 ms previously; no claim of improved mesh-sync tail latency is made.

First encounter remains synchronous. Next work should move source preparation out of live callbacks, measure/bound dependency-validation overhead and separate object/material extraction from lighting. Shared decoding is a prerequisite, not completion of the reported 300 ms stall repair.

Release package: D:/MEngineNativeQA/releases/editor-shared-pose-20261015/mengine-editor-tauri.exe. Final branch identities and file hashes are recorded in the package release.json.

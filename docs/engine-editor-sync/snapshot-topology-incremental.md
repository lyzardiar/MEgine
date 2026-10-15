# Incremental viewport snapshot topology

Scene and Game snapshot mirrors preserve surviving entity handles across additions, removals and reparenting. Only changed component records and references affected by mapping changes are applied. Children and indexed query order follow the source snapshot, including reused source slots and historical frame replay. Batch removal filters explicit traversal and affected sibling lists once.

## Controlled Release benchmark

`cargo run -p mengine-scene --example benchmark_snapshot_topology --release`

The old/new Release binaries alternated twice; each run replayed three identical sequences of 320 snapshots containing 6,000 entities. Snapshot capture is excluded. Median sequence time fell from 10,249.4309 ms to 607.10195 ms (16.88x), or 32.03 ms to 1.90 ms per topology update. This measures snapshot materialization, not frame rate.

New-only probes: 320 unchanged updates took 146.0 / 163.5 ms; 640 ordered component queries took 77.6 / 82.3 ms; deleting 3,000 of 6,000 grouped entities took 10.0 / 8.1 ms; deleting the remaining 3,000 took 6.2 / 6.2 ms. No old-version comparison is claimed for these extra workloads.

## Validation

Final stable-source tests: core 19 passed / 1 ignored; scene 25 passed; runtime 222 passed; editor-host play runtime 23 passed / 3 ignored. Source diff whitespace check passed. Tests cover stable handles, cached snapshot identity, source-slot reuse, traversal and query ordering, batch parent/child deletion, missing/restored references and replaying older revisions.

## Sprite discovery responsiveness

A fresh native acceptance run exposed a separate startup stall in both the old and new packaged editors. Native main-thread stack capture showed recursive directory traversal beneath `Path::is_dir` and `GetFileAttributesExW`. `list_project_sprites` was a synchronous Tauri command, unlike the existing background asset scan.

Sprite discovery now runs in a blocking worker after copying only the project root under the lock. Directory traversal uses `DirEntry::file_type` and skips symbolic links, matching asset discovery; it no longer requests path metadata for every directory test. Image dimensions and import settings remain part of the returned sprite index. The command name and serialized response are unchanged.

Initial failed native runs are retained under `D:/MEngineNativeQA/rpg-multiview-snapshot-incremental-after-1792065271949`, `snapshot-control-before-1792065494398` and `snapshot-ordered-start-after-1792065742152` (the latter two share the `rpg-multiview-` prefix). Their fixture files were restored after their owned processes exited. No successful runtime acceptance is inferred from these failures.

## Final native acceptance

The final packaged Release passed the original startup order, authored/play title parity, custom Dota map entry, 12 seconds of unsampled live play, CPU/Memory/Resources history, frozen resource stability, Live resume and Stop. Console errors: zero. Owned editor exited normally and the fixture was restored. Project-open stage took 1.506 seconds; project-ready and camera setup took another 0.445 seconds. Sprite scan regression: 1 passed (290 total passed, 4 pre-existing ignored across this milestone).

Report: `D:/MEngineNativeQA/rpg-multiview-snapshot-final-after-1792066668808/report.json`.

Against the earlier successful packaged baseline on the same fixture, count-changing Game frames (42 in each run) fell from median 35.6449 ms world sync to 7.9647 ms. All Game world-sync P95 fell from 37.5224 to 8.0823 ms. Scene world-sync P95 fell from 37.7125 to 8.8517 ms. Game presentation P95 fell from 73.3 to 53.2 ms; its median stayed 31.9 ms. Scene presentation median rose from 31.35 to 38.8 ms, while P95 fell from 75.9 to 54.1 ms. These are separate live runs, not deterministic frame-rate comparisons; both covered 4,733–4,972 entities.

Remaining performance issue: Game max presentation was 246.1 ms and Scene 216.5 ms. At revision 400, RuntimeMeshCache.sync consumed 179.924 ms (Game) and 169.065 ms (Scene); world sync in those frames was 5.959 / 7.1393 ms. Scene revision 459 also spent 58.0202 ms in RuntimeTextureCache.sync_ui. Mesh/resource synchronization spikes still need investigation; this delivery does not establish smooth 60 FPS or resolve every reported 300 ms stall.

Release entry: `D:/MEngineNativeQA/releases/editor-snapshot-incremental-20261015/mengine-editor-tauri.exe`. Debug/Release V8 players were rebuilt and runtime identity checked; standalone player gameplay was not separately exercised.

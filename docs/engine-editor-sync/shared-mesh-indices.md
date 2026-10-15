# Shared mesh index buffers

The native mesh-upload profile captured index-buffer creation spikes of 43–55 ms while vertex conversion and bounds took fractions of a millisecond. Animated poses and camera-specific billboard meshes previously allocated fresh index buffers even when all index values were identical.

Each Renderer now caches index buffers by the complete `Vec<u32>` contents. Hash lookup always checks full equality, so equal lengths, hash collisions, source reloads and topology changes cannot reuse incompatible indices. Vertex buffers, bounds and index counts remain per mesh. Public `MeshGpu::upload` and `upload_profiled` retain their standalone allocation behavior.

The device-local cache holds at most 512 entries and 16 MiB of combined CPU index keys and GPU index payload (excluding map metadata). Hits refresh recency; insertion evicts the least recently used entries as needed. Oversized entries bypass retention. Eviction drops only the cache's buffer handle; existing meshes and queued draws retain their own handles. Renderer teardown releases the cache. Existing pose-byte counters remain logical per-mesh estimates, not deduplicated physical allocation measurements.

The `Mesh index buffer lookup and upload CPU` scope includes hash/equality lookup, allocation on misses, key copying and eviction. Native per-frame counts include `meshIndexBufferReuses`; actual index allocations in mesh synchronization equal `meshUploads - meshIndexBufferReuses`. No cache hit time is omitted from the mesh-upload aggregate.

## Validation

GPU regressions verify equal-content buffer identity with independent vertex/bounds data, equal-length differing topology, LRU refresh, entry/byte budgets, oversized and empty inputs, disabled cache limits and public upload compatibility. The multi-view pixel test evicts a still-visible mesh from the index cache, verifies the mesh remains visible, then replaces the same mesh key with equal-length different topology and verifies changed pixels before restoring the original topology. Existing multi-camera asset dependency tests remain part of the library suite.

Library validation: 352 passed, 0 failed, 4 ignored. The host's 59 tests also passed after changing sampled-mesh memory provenance from lower-bound to estimate. Logs: `D:/MEngineNativeQA/shared-mesh-indices-libs.log` and `D:/MEngineNativeQA/shared-mesh-indices-provenance-tests.log`.

## Remaining UI preparation evidence

In the attribution baseline, revision 686 is the only live UI-prepare sample above 5 ms in either view (Game 36.5228 ms, Scene 37.5155 ms). Median UI preparation is 0.0967/0.0297 ms; second-largest is 0.3369/0.1249 ms. Revision 683 first incurs UI texture-sync spikes of 33.2999/31.7409 ms. Main UI primitive counts at revision 686 (766/212) are below earlier counts (963/460), excluding the monotonic main instance/soft-clip buffer growth path; auxiliary channel/material buffers remain possible.

Existing material pipeline counts cover 3D materials, not UI. UI custom-pipeline creation is synchronous on key misses; sampled effects with alpha cutoff or Multiply can introduce new generated UI shader sources. The report does not capture UI pipeline keys/misses, so it does not prove which operation caused the spike. Follow-up should distinguish UI packing, writes, auxiliary growth, texture sets, pipeline creation and pruning before changing cache policy. The index-sharing change does not address this separate event.

## Native Release results (2026-10-16)

Report: `D:/MEngineNativeQA/rpg-multiview-shared-mesh-indices-after-1792082024911/report.json`. Release/Debug V8 players and SDK verified; project/menu/play parity, simultaneous Scene/Game, Profiler modules/frozen history/Live/Stop passed. Zero console errors, normal exit, fixture restored. Live screenshot inspected. All expected timing scopes appeared and recursive containment passed.

| Phase / view | Mesh uploads | Index reuses | New index buffers |
| --- | ---: | ---: | ---: |
| Loading / Game | 328 | 284 | 44 |
| Loading / Scene | 326 | 282 | 44 |
| Warmup / Game | 3681 | 3673 | 8 |
| Warmup / Scene | 3612 | 3604 | 8 |
| Live / Game | 3628 | 3624 | 4 |
| Live / Scene | 3589 | 3585 | 4 |

Live sampling avoided 7209 of 7217 index allocations (99.89%). Across warmup/live, the largest index lookup/upload aggregate was 0.171 ms; the attribution baseline had 43–55 ms index allocation spikes. The fixed-content GPU regression establishes sharing correctness; these sequential native runs are observational rather than a controlled FPS comparison.

Live presentation median/P95/max: Game 26.4/50.6/125.4 ms; Scene 26.1/38.9/74.0 ms. Baseline was Game 25.8/50.2/144.6 ms and Scene 25.85/36.9/119.4 ms, so typical frame intervals have not materially improved. Scene revision 469 still spent 44.8929 ms creating a vertex buffer. Revision 706 still spent 36.8669/40.2007 ms in Game/Scene UI preparation. Initial material preparation still takes about 1.35 seconds per view during loading. These remaining costs are not fixed by sharing index data.

Detailed stages, counts and worst samples are in `shared-mesh-indices-native.json`. Browser profile publication median/P95/max is 0.2/0.3/0.5 ms. The authored fixture and uncommitted user validation files were preserved.

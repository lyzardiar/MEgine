# Independent Scene revision mirror

Author: MiYu

Play-mode Scene, Game and camera preview consume the same published world history through separate ECS mirrors. The Scene command now calls `render_scene_revision_with_snapshot`; its mirror remains locked for its own frame compilation and GPU readback without holding the Game mirror. Existing renderers, camera/visibility behavior and frame-transport ownership remain in use.

Each entry obtains the requested immutable snapshot before acquiring its view's mirror, checks the Play generation after acquiring it, updates that mirror from the snapshot, and rejects results if the generation changes during rendering. The source snapshot accompanies the mirrored world so Scene visibility filtering continues to use the original browser entity IDs. A new generation resets the mirror when that view next renders. This adds one lazily populated Scene ECS mirror, not another simulation or script VM.

## Correctness checks

- V8 runtime suite: 23 passed, zero failed, three existing manual diagnostics ignored.
- QuickJS runtime suite: 23 passed, zero failed, three existing manual diagnostics ignored.
- Scene snapshot/visibility suite: three passed, zero failed.
- A blocked Scene keeps its original frame while Game and preview finish revisions 2, 1 and 2 before Scene is released. Scene can subsequently render a retained older revision; all three views reject expired history.
- Stop/restart rejects both the running Scene result and a previously acquired snapshot awaiting access to the Scene mirror. The next Scene request sees the restarted frame and clear color.
- Entity-slot reuse validation uses the new Scene entry, verifies original source IDs differ from mirror IDs, and exercises the actual Scene filter: hide replacement, unhide it, hide its parent and descendants. The retained source remains unchanged.
- An independent read-only review found no blocking ownership or lock-order issue. The queued-frame test establishes old-snapshot rejection with a held mirror; its scheduling signal precedes the lock call and does not claim to observe the operating-system wait state.

## Controlled comparison

The runner `D:/MEngineNativeQA/profile-scene-mirror.mjs` extends the fixed five-stage viewport QA with native-process private bytes and working-set snapshots taken outside each timed CPU sample. The browser children are not included in those process counters. Private committed bytes, working set and the renderer's logical resource estimates are different measurements and must not be combined as one resident-memory total.

Both variants use the same scene/script fixture `3098765`, viewport layout, render sizes and quality settings. CPU sampling is enabled for both. The owned editors run hidden and unfocused with background throttling disabled; results measure local completion cadence, not physical scanout or foreground behavior on the user's other computer. The reported approximately 200 ms issue there remains unresolved.

| Layout | Game mean before / after | Game P95 before / after | Scene mean before / after |
| --- | --- | --- | --- |
| Scene + Game + camera preview + Profiler | 22.562 / 23.168 ms | 34.8 / 38.4 ms | 20.380 / 20.326 ms |
| Scene + Game + Profiler | 21.359 / 20.663 ms | 33.3 / 32.6 ms | 20.167 / 19.380 ms |
| Game + Profiler | 18.899 / 18.690 ms | 22.8 / 23.0 ms | inactive |
| Game, Profiler hidden | 18.783 / 18.576 ms | 23.0 / 23.2 ms | inactive |
| Repeated camera-preview multiview | 22.606 / 22.495 ms | 35.0 / 36.3 ms | 21.178 / 20.115 ms |

In the three multiview stages, Game mean world-lock wait fell from 2.176/2.630/1.648 ms to below 0.001 ms. Scene mean world-lock wait fell from 1.312/1.211/1.606 ms to below 0.001 ms. The native Game command mean similarly fell from 11.286/11.549/10.859 ms to 9.382/9.171/9.292 ms. The isolation goal is verified, but complete cadence did not improve consistently: the first preview stage and both preview P95 values worsened. This is not a general FPS improvement claim.

The two preview stages expose a remaining delivery bottleneck: native publication-ready to browser event receipt rose from 1.760/1.772 ms to 5.044/4.746 ms. Native UI queue means remained below 0.24 ms. These measurements locate additional delay in delivery to the browser, but do not alone prove which browser task caused it. Investigate completion-handler work and competing view paints before attributing that delay to GPU execution or adding it to overlapping CPU scopes.

Native private committed memory ranged 4,575.5-4,617.2 MiB before and 4,595.3-4,665.1 MiB after. Four later stages measured 48.4-61.8 MiB more private commitment, while the first measured 22.0 MiB less. Working sets ranged 1,418.1-1,438.7 MiB before and 1,394.4-1,435.2 MiB after. Process counters include allocator/driver/runtime variation and do not isolate the exact extra ECS-mirror size. Renderer resource estimates shown in the UI are not these process totals.

Release build passed in 4m 54s, retaining the existing unused-function warning. Five stages passed with zero long tasks and zero console errors. Active Game/Scene captures took 315/269 ms; the following second produced 48 Game and 54 Scene frames. Alternating Scene/preview pixel differences were 158/230,400 and 68/57,600, within the existing 0.5% animation tolerance. The multiview screenshot was visually inspected. The owned editor exited normally; its runtime directory remains after Windows denied deletion. No user editor was closed.

Baseline: `D:/MEngineNativeQA/rpg-multiview-scene-mirror-before-1791930739200/report.json`, engine `59bc262`. Acceptance: `D:/MEngineNativeQA/rpg-multiview-scene-mirror-after-1791931185679/report.json`. Compact metrics, including the delivery timings and process counters, are in `viewport-scene-mirror.json`.

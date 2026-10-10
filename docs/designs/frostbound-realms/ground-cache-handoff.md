# Shared terrain routes and exact building approaches

Author: MiYu.

AI construction probes share the map's terrain geometry and directed edge eligibility by collision radius. Each probe keeps its own building mask, resource knowledge and obstacle checks. Geometry invalidates when heights, ramps or relief change; route edges also invalidate when terrain changes. Per-state frame caching avoids repeatedly hashing the map during one simulation frame, and observes replacement of a shared map cache by another state. Caches remain in WeakMaps, outside saved and network state.

Trusted ground queries reuse plane detection for the current validated geometry. Direct map queries continue checking geometry independently. Changed maps are validated on the next state frame, preserving the simulation's frame-based cache semantics.

For a building-occupied goal, breadth-first search finds the minimum possible goal distance among unblocked interior cells in the start's terrain region, including the start itself. It stops only after reaching that lower bound. Every cell the original search could reach belongs to that region, so reaching the bound proves the closest possible approach. BFS insertion order preserves equal-distance ties. If the closest eligible cells remain unreachable because of trees or other obstacles, search still exhausts the reachable region. Searches without a goal still visit the complete region.

Eight alternating Node CPU measurements, after two warmups, compare 24 hypothetical building searches per map against 46a296b. Default-map median is 2372.259 → 59.175 ms; highland is 2383.720 → 68.556 ms; sealed cliffs are 1945.127 → 56.990 ms. Complete paths match in every run. Default-map tile builds fall from 17,039 to 282; ground checks from 18,650 to 282. These measurements exclude QuickJS, editor commands, rendering and IPC.

Native QuickJS measurements reproduce the Orc versus Night Elf first simulation tick on fresh default maps. Five measurements after two warmups give 2799.669 → 55.933 ms. The authored siege map remains approximately 124 ms, and the measured highland opening remains approximately 1.4 ms. This manual benchmark excludes native world commands, rendering and IPC and retains the normal memory limit. Production script deadlines are unchanged.

Exact-state regressions compare 144 complete paths and 315 complete AI states against the previous search, covering both teams, four collision profiles, trees, boundary targets, hypothetical footprints and nine map/faction combinations. Water close/open, replaced maps and arrays, height/ramp/relief edits, cross-state invalidation and restored highland maps match fresh searches. Terrain, ground detail, forest/TCP, Night Elf AI production, economy, save, generated client and takeover/reconnect tests pass. The previously failing native classic-menu integration passes in 57.94 seconds with its original one-second gameplay budget.

All four native sample integrations pass: the menu test above and three skirmish/editor/RPG, snapshot-delta and Unicode map/save/cancel/undo tests. Full native editor acceptance passes in 207.449 seconds, covering fresh hierarchy drag/search/selection/rename, Scene/Game spatial queries, F1 gameplay, 45-second playback, exact retained revisions, paused Inspector/diff changes, pause/step/stop restoration and Toggle/InputField/restart. Console errors are zero. The QA-owned editor exits normally and its discovery entry is removed; WebView cache removal returns EPERM, so the owned fixture remains.

The authored scene and project remain byte-identical to the previous stage. Main.js is regenerated using the committed model catalogue; unrelated catalogue and asset edits are preserved. A second output directory reproduces Main.js, Main.mscene and project.json byte exactly. Material-sidecar validation still finds 3,151 tracked materials, zero missing/untracked sidecars and zero duplicate GUIDs.

Native camera/shadow/submitted/render object counts remain 162/188/236/277. Actual native presentation is 9.034 FPS; frontend refresh timings are a separate statistic. Average native command time is 59.532 ms, simulation time 63.330 ms and render time 15.453 ms, so command/script work remains the next measured performance target. These phases overlap and must not be added together. The native executable is unchanged from the preceding stage; this stage updates the loaded sample script.

Evidence is in ground-cache-validation.json, native-play-state-spatial-ground-cache.json and the three spatial-ground-cache PNGs. The reproducible benchmark and route/state comparison scripts retain 46a296b as their baseline.

Full Warcraft III feature parity and smooth large-scene playback remain unfinished. This stage addresses the concrete AI opening timeout while preserving game rules and path output.

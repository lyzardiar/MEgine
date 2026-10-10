# Incremental client display work

Author: MiYu.

The client clears every authored unit slot and environment part during initial display. Later frames visit the current and previous counts, retaining cleanup when counts shrink and when menus replace gameplay. Counts retain their original authored limits. Hidden parts, discarded commands, deaths, reincarnation and residency preserve the committed world state.

Each incremental ground-decoration batch validates terrain geometry once and reuses trusted sample, clearance and slope queries. The original eight-slot frame budget, candidate order, normals and rejection rules remain unchanged. Direct elevation callers still validate geometry by default. WeakMap caches remain outside save and network data.

Against 5767278, 32 complete authored worlds containing 24,671 entities match exactly. Another 324 complete decoration snapshots match across default, highland and siege maps, incremental budgets, geometry/water/surface edits and independent map objects. Nine relevant Node scripts pass; four native sample integrations pass in 105.74 seconds. Main.js, Main.mscene and project.json reproduce byte exactly in a separate output directory using the committed model catalogue. The authored scene/project remain unchanged, and unrelated local edits remain outside this stage.

The manual native QuickJS benchmark uses the actual incremental update API, 50 measured frames after five warmups and the full authored world. Median step time falls from 64.286 to 36.014 ms. Mean unit display time falls from 29.56 to 4.44 ms. Renderer/IPC work is excluded; profiling storage and snapshot deltas are included. HUD subdivisions are consecutive phases; native API wrapper times overlap those phases. These timings are separate from presentation FPS.

Full native editor acceptance passes in 214.765 seconds with zero console errors. It covers hierarchy drag/search/selection/rename, virtual navigation, Scene/Game spatial queries, F1 gameplay, 45-second continuous playback, retained world revisions, paused Inspector/diff edits, pause/step/stop restoration, Toggle/InputField interaction and restart. Actual native presentation improves from 9.034 to 14.209 FPS. Average native command time falls from 59.532 to 27.583 ms; simulation falls from 63.330 to 27.626 ms. These phases overlap. Camera/shadow/submitted/render object counts remain 162/188/236/277. The native executable is unchanged; this stage updates the loaded sample script.

The material fix in 2c555fa is already in the remote branch. All 3,151 tracked materials have valid, unique sidecars, and every sidecar matches its committed Git blob. Fresh native import creates only two sidecars for existing untracked local materials, RealWisp and EntangledMine; no committed material needs a new sidecar. The other computer's reported 2,736 paths remain unverified because exact paths and a commit ID were not supplied.

The owned QA editor exits normally and its discovery entry is removed. WebView runtime cache removal returns EPERM, so its disposable fixture remains under E:/work/codex/cache/mengine/native-qa. No user editor is closed. Evidence is in script-display-validation.json, native-play-state-spatial-script-display.json and the two spatial-script-display PNGs. Full Warcraft III parity and smooth large-scene playback remain unfinished.

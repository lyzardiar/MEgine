# Validated ground display and stable HUD layout

Author: MiYu.

Resource and HUD display batches validate map geometry once and reuse trusted elevation queries for scenery, doodads, placement previews, foundations, markers, effects and waypoints. Height/ramp/relief changes invalidate geometry before each batch. Simulation elevation callers retain their existing validation behavior.

The minimap rectangle is computed once per HUD render. Tile RectTransforms update when the editor layout or mode changes; reactivation retains the original authored-layout restoration. Ground chunks compare their terrain/fog values and tileset before constructing and serializing material parameters. Water uniforms retain their original clock updates. Game rules, animation clocks and render cadence are unchanged.

Against bdeb052, 90 complete native-normalized worlds match across default, highland and siege maps, four viewport shapes, retained frames, live geometry/water/surface/doodad/tileset edits, water clocks, fog hide/reveal and menu/editor/game transitions. Another 32 complete worlds match for unit slot growth/shrink, capacity, deaths, reincarnation, residency and discarded writes. Each authored world contains 24,671 entities. Nine relevant Node scripts pass, including construction, generated AI and reconnect checks. All four native sample integrations pass in 105.55 seconds with the original production deadlines.

The manual native QuickJS benchmark uses the actual incremental update API and 50 measured frames after five warmups. Median step time falls from 35.542 to 32.676 ms; the last 20 frames fall from 34.973 to 32.238 ms. Mean minimap display time falls from 2.20 to 1.08 ms, scenery from 6.90 to 4.76 ms and ground from 4.56 to 3.96 ms. Renderer/IPC work is excluded; profiling storage and snapshot deltas are included. API wrapper timings overlap the script phases.

Full native editor acceptance passes in 207.344 seconds with zero console errors. It covers hierarchy navigation, drag/search/selection/rename, Scene/Game spatial queries, F1 gameplay, 45-second playback, retained revisions, paused Inspector edits, pause/step/stop restoration, Toggle/InputField interaction and restart. Actual native presentation improves from 14.209 to 15.582 FPS. Average command time falls from 27.583 to 23.939 ms, while render time remains about 13.4 ms. These phases overlap and must not be added together. Camera/shadow/submitted/render object counts remain 162/188/236/277.

Main.js, Main.mscene and project.json reproduce byte exactly in a separate output directory using the committed model catalogue. The authored scene/project and native executable are unchanged. Unrelated local catalogue, asset and report edits remain outside this stage. The owned QA editor exits normally and its discovery entry is removed; WebView runtime-cache removal returns EPERM, so the disposable fixture remains under E:/work/codex/cache/mengine/native-qa.

Evidence is in ground-display-validation.json, native-play-state-spatial-ground-display.json and the two spatial-ground-display PNGs. Native requests still average 56.359 ms and playback remains below a smooth frame rate. Full Warcraft III single-player, multiplayer, map-editor, TD and Dota parity remains unfinished.

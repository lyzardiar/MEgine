# WorldSpace UI transform traversal

Author: MiYu.

WorldSpace UI layout resolves the scene transforms only after finding an enabled WorldSpace Canvas layout root. ScreenSpaceOverlay, ScreenSpaceCamera, absent Canvas and inactive WorldSpace roots return without resolving world transforms. Canvas mode, activity, hierarchy and transform edits are evaluated on every layout, so switching to WorldSpace and directly editing its transform still projects the current UI.

On the unchanged 24,671-entity Frostbound scene, alternating Node/Vite measurements reduce median WorldSpace layout time from 12.608 to 0.251 ms. Six complete layout outputs match the previous implementation through Canvas mode, activity and direct transform changes. This isolated result excludes React, scripts, IPC, native rendering and gameplay FPS.

106 focused editor tests pass: 46 Canvas rendering/layout tests, 21 retained Play/frame/presentation tests and 39 related layout/scaling/renderer/workspace tests. TypeScript/Vite and the packaged Native Release build pass; the native build takes 298 seconds. Full native acceptance passes in 186.531 seconds with zero console errors, covering virtual hierarchy navigation/search/drag/rename, Scene/Game spatial queries, F1 gameplay, 45-second playback, exact retained revisions, paused Inspector edits, pause/step/stop restoration, Toggle/InputField input and restart.

The exact executable is D:/MEngineNativeQA/construction-build/release/mengine-editor-tauri.exe, SHA-256 50fdf113e2f77ca9d631bb2db75c1a16e87e8a586ae5e718d01d760d201a9a39. Main.js, Main.mscene and project.json remain identical to HEAD. Camera/shadow/submitted/render counts remain 162/188/236/277. The owned QA editor exits normally and removes its discovery entry; its runtime cache cannot be removed, so the isolated fixture is retained.

Native presentation in this run is 14.778 FPS, compared with 15.582 FPS in the prior ground-display run. Average command/render/request time is 23.414/12.853/59.532 ms. These overlapping timings must not be summed, and the two runs do not establish an overall gameplay FPS gain. The new separate browser CPU profile still shows recursive Play comparison and hierarchy activation as material work.

Evidence: ui-worldspace-validation.json, native-play-state-spatial-ui-worldspace.json, the spatial-ui-worldspace Scene/hierarchy screenshots and play-state-spatial-ui-worldspace.png. scripts/benchmark-frost-ui-worldspace.mjs reproduces the local comparison against cf46014. Existing catalogue, images and reports outside this stage are preserved.

Continue with measured Play-state comparison and displayed-world hierarchy/UI work. Do not cache mutable-world equality across frames or steps by array/entity identity; live alias edits and exact session/revision/clock pairing must remain covered. The full Warcraft III single-player, multiplayer, map editor, TD and Dota objective remains active and incomplete.

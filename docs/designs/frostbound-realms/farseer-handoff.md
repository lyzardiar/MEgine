# Far Seer original assets and model-particle playback

Author: MiYu

The running simulation, generated client and command card now use the original Far Seer hero, portrait, Spiritwolf model and three ranked source profiles. C/F/T/E execute Chain Lightning, Far Sight, Feral Spirit and Earthquake, with a 0.3-second cast point and completion-time mana/target checks. Save/restore and the TCP server use protocol 68.

`LightningBoltMissile` uses a PREM emitter whose child is `SharedModels/Lightning2.MDL`, resolved to the installed original MDX. The exporter preserves the child binding and particle age, restores the source KPEV emission gate, and keeps child scale at one because the GLB already contains the source-unit conversion. Stand and Birth have no child-model samples; Death has 114 sampled particle instances. The model retains all three original geometry/texture layers and billboard nodes.

The sampled-effect runtime loads project-contained GLB dependencies, samples child animation using particle age, applies source layer colors and textures, and projects each original triangle with its own vertex UVs, perspective coordinates, depth test and blend mode. Existing billboard, ribbon and light assets keep their previous schema behavior.

Validation entry points:

- `python scripts/test-frost-farseer-assets.py`: source/output/dependency hashes, 162 deterministic metadata GUIDs, 182 geometry pose samples, offline byte-identical reconstruction, modified-output and corrupt-dependency rejection.
- `cargo test -p mengine-assets --lib sampled_effect`: three schema/sampling tests, including model dependency and age/state validation.
- `cargo test -p mengine-runtime --lib sampled_effects`: three runtime tests, including the original child model's three layers, UVs, age, scale and billboard projection.
- `node scripts/qa-frost-farseer-effects.mjs`: isolated native GPU preview of three Death timestamps, with native error/material checks and owned-process shutdown.
- `node scripts/qa-frost-farseer-assets.mjs`: original ranked Spiritwolf native asset preview.
- `node scripts/test-frost-farseer-profile.mjs`: original hero attributes/growth, source mana fields, four command cards, ability field meanings, wolf combat/passives, and CommonJS/browser profile parity.

For a native-only change, reuse the existing frontend and build with `cargo build -p mengine-editor-tauri --release --features tauri/custom-protocol --target-dir D:/MEngineNativeQA/construction-build`. The custom-protocol feature embeds the frontend; omitting it leaves the editor dependent on its development URL and prevents isolated QA from becoming ready.

Current validation passed: 428 signed files, 162 GUIDs, 182 geometry samples, offline byte-identical reconstruction, both tamper rejection cases, three asset tests and three runtime tests. The native model-particle preview completed in 11.211 seconds with all 512 expected triangles present, zero console errors, zero material rejections, normal owned-editor exit and fixture cleanup. Reports and screenshots are beside this document. Existing Orc hero and Blademaster asset outputs remain byte-identical; the Blademaster generated-client and conversion regressions passed.

Receipts: `farseer-{art,particle,rules,effects}-sources.json`. The effect receipt fingerprints the referenced child-model receipt and the actual model/material/texture dependencies. Original Warcraft assets retain their Blizzard source attribution; converter MIT notices apply to the converter.

The source hero profile gives level-one HP 475, maximum mana 285, source initial-mana field 100, average attack 24, attack range 6, attack interval 2.28 and homing missile speed 12. Chain Lightning targets organic enemy/neutral ground or air units, with 4/6/8 total hits and 15% per-hop decrease. Earthquake's DataA is its 0.5-second effect delay, DataB is 50 building damage per second, DataC is 75% movement reduction, and DataD is final area 250 source units. Its source target flags do not restrict the effect to enemies. Permanent Invisibility's DataA enables automatic target acquisition; it does not specify fade time.

Chain Lightning hits 4/6/8 distinct organic targets and decreases damage by 15% per hop. Far Sight reveals and detects at unexplored positions for eight seconds and survives caster death. Feral Spirit creates two ranked wolves atomically, replaces existing wolves, expires after 60 seconds, and applies source critical strike and independent permanent invisibility. Earthquake channels for 25 seconds with a 0.5-second effect delay, 50 building damage per second and 75% ground movement reduction, including friendly targets. Stop, stun, death and teleport interrupt it. Source CLPB/CLSB ribbons, PREM Death hit particles, original spell effects, wolf body/portrait and ordinary missile geometry/particles are connected to gameplay.

Gameplay validation: `test-frost-farseer.mjs` passed 15 groups, including replacement-frame ghost-hit prevention and immediate Mountain King Bash interruption. The generated-client check covers C/F/T/E, original animation/model/portrait/effects, ranked scaling, source missile launch height, in-flight save restoration and F5 continuation. The real localhost TCP check covers ownership, ranked wolves, private Far Sight, Chain Lightning and Earthquake reconnect/Stop. Lightning conversion checks source/output/generator hashes, offline byte-identical reconstruction and modified-output rejection. Existing game regressions passed by continuing at the failing fixture catalogue entries; this is segmented coverage, not one uninterrupted full run. The Blademaster generated-client check was also refreshed against the final product.

Native gameplay validation passed with zero console errors and zero rejected material pipelines. C/F/T/E, rank-three body/portrait/scale, CLPB/PREM effects, fogged-ground Far Sight, Earthquake building damage, F5 continuation and Stop were exercised in the native editor. The owned editor exited normally and its runtime/discovery/fixture/storage were removed. Product hashes match `farseer-client-validation.json` and `native-farseer-qa.json`; a separate build reproduced Main.js, Main.mscene and the four lightning shader/material outputs byte for byte.

Native stage times: open/readiness 82.598 seconds; hero/cards/wolves 78.410 seconds; Chain Lightning/Far Sight 58.966 seconds; Earthquake/F5/Stop 99.541 seconds. The preflight reused matching generated-client fingerprints in 35 ms. Command-level timing is in the native report; stage times include those commands and must not be added to their totals. `farseer-stage-validation.json` records regression segments, final fingerprints and rebuild checks. Physical input, audio listening, original-game solver parity and cross-machine LAN remain unverified. Full Warcraft III single-player, multiplayer, editor, classic TD and Dota parity is still an active project objective.

The child GLBs use embedded buffers. Automatic cache recovery after an external GLTF buffer is removed and restored remains an engine follow-up.

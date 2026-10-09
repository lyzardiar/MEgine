# Far Seer original assets and model-particle playback

Author: MiYu

The original Spiritwolf body and portrait, three ranked source profiles, four Far Seer spell definitions, and ten original spell/body effect bindings are converted. `game/farseer.js` supplies the source hero/command-card and wolf combat profiles; registration in the running simulation and skill execution are still pending.

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

Follow-up: register the Far Seer source profile in simulation, generated client and UI; implement Chain Lightning bounce/decrease, Far Sight vision, two ranked timed wolves including critical strike/permanent invisibility, and Earthquake building damage/slow/channel interruption. Add save/restore and TCP state, then validate the complete gameplay path. Original-game solver parity, audio listening, physical input and cross-machine LAN remain separate acceptance requirements.

The child GLBs use embedded buffers. Automatic cache recovery after an external GLTF buffer is removed and restored remains an engine follow-up.

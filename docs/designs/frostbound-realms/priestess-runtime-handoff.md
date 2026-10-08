# Priestess of the Moon runtime handoff

Author: MiYu

New Night Elf skirmishes use class 2 / sourceHero Emoo with priestessVersion 1. Legacy saves restore version 0; other game modes retain their existing profiles. The complete Warcraft III recreation remains active.

The imported TFT profile drives AGI damage, attributes, HP/mana, vision, source arrows, learning, recruitment and revival. Scout summons one controllable, invulnerable flying Owl with source rank stats and timed detection. Searing Arrows supports manual targeting and private right-click autocast. Trueshot adds the source percentage to nearby ranged allies and the Priestess. Starfall has a paid cast, interruptible channel, enemy-only pulses and building damage multiplier. Source AI skill orders and channel decisions are integrated.

The generated client uses the original Priestess/Owl body and portrait cameras, source icons, normal/flaming arrows and complete original spell geometry. C/R/T/F hotkeys follow source abilities; T is passive. Attack HUD shows the aura bonus. Protocol 59 validates hero identity, casts, Owl ownership and unique live summons. F5 and actual TCP reconnect retain source summons, autocast and Starfall. Staff and Town Portal transport immediately cancel affected pending casts/channels.

Terrain decoration generates eight deterministic candidates per render frame, retaining progress across identical network map snapshots. Completed decoration matches synchronous geometry, including candidate coordinates, height and normal. Terrain mesh, movement and collision use their existing formulas.

Validation entry points: node scripts/build-frostbound.mjs; node scripts/test-frost-priestess-source.mjs; node scripts/test-frost-priestess.mjs; node scripts/test-frost-priestess-client.mjs; node scripts/test-frost-priestess-network.mjs; node scripts/test-frost-terrain.mjs; node scripts/test-frostbound.mjs; MENGINE_QA_SCOPE=final-smoke node scripts/qa-frost-priestess.mjs. Native reports preserve actual stage results, command durations, generated product hashes and owned Editor shutdown. The initial report records its failed assertion; native-priestess-incremental-qa.json records complete skill/F5 continuation acceptance. The final report targets the final terrain cache change with cold entry, source hero/Owl HUD and F5 validation; MENGINE_QA_SCOPE=terrain-smoke reproduces it.

The receipt signs 404 converted/original outputs and eleven generator hashes. Independent rebuild outputs are byte-identical. Original assets remain Blizzard material; extraction does not establish redistribution permission. asset-library remains read-only. Authored Main.mscene, root .gitattributes and model-catalog.json are protected separately from generated build/test output. No C# edits are included.

Original Warcraft runtime parity remains unverified for attribute rounding/complete attack speed, repeated Owl replacement and placement, Searing range/type/immunity, Trueshot basis/stacking/linger, Starfall pulse timing/Dur45 versus HeroDur30/building formula, and XP. Physical input, audio listening and cross-machine LAN remain unverified. Current implemented Starfall rules use a first pulse after 1.5 seconds and 45 seconds of channeling; a repeated Scout command is rejected while a live Owl remains.

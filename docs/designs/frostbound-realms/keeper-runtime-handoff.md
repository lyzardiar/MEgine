# Keeper of the Grove runtime handoff

Author: MiYu

New Night Elf skirmishes use class 1 / sourceHero Ekee with keeperVersion 1. Legacy saves retain the prototype hero through version 0; other game modes keep their existing profiles. The full Warcraft III recreation remains active.

The source Keeper profile drives attributes, INT weapon damage, HP/mana, regeneration, vision, attack dice, source missile, learning, recruitment and revival. Source first/later AI learning sequences and legal Roots/tree/channel decisions are integrated. Four abilities use the imported TFT rows: delayed Entangling Roots with ordinary/hero duration and immediate dispel cleanup; atomic tree conversion to source efon Treants; strongest non-stacking direct-melee Thorns Aura; and interruptible, self-inclusive, 30-second Tranquility. Treants retain source speed, gain Nature's Blessing armor immediately, use Ultravision sight, and expire after 60 seconds.

The generated client uses original Keeper/Treant bodies, model scales, selection circles, portrait cameras, icons, missile and five original effect bindings. E/F/R/T hotkeys take precedence over overlapping QWER aliases; Q/W remain alternate Roots/Nature keys. Roots targets a visible organic ground enemy, Nature targets a living tree, Thorns is passive, and Tranquility casts on the Keeper. Source casting and channel animations accompany actual simulation state. All three original Tranquility geometry layers are retained. Hit effects expire without recurring from old snapshots.

Protocol 58 synchronizes source spells, summons and channels. Saved casts retain the learned rank at command time; strict state validation rejects forged identity/stats/channel orders. F5 and TCP disconnect/resume retain active channels and source units. Invalid commands preserve a pending cast; successful replacement orders interrupt it.

Validation entry points: `node scripts/build-frostbound.mjs`, `node scripts/test-frost-keeper.mjs`, `node scripts/test-frost-keeper-client.mjs`, `node scripts/test-frost-keeper-network.mjs`, `node scripts/test-frostbound.mjs`, and `node scripts/qa-frost-keeper.mjs`. Native QA uses an owned isolated project and closes only its own editor through normal shutdown. `native-keeper-qa.json` records actual native steps, command durations, screenshots, shader diagnostics and cleanup. `keeper-runtime-validation.json` records final delivery evidence.

Original Warcraft runtime parity remains unverified for attribute rounding/complete attack speed, Roots attack/spell restrictions, sparse-tree placement, Thorns damage basis/type/aura linger, Tranquility first pulse/interrupt/stacking, and XP behavior. This implementation's Nature rule summons up to the available source tree count; insufficient legal space cancels release without mana, cooldown or tree consumption. These are explicit prototype decisions pending original-runtime comparison. Source assets remain Blizzard material; their conversion does not establish redistribution permission. Physical input, audio listening and cross-machine LAN acceptance remain unverified.

The authored Main.mscene, root .gitattributes and model catalog are protected independently of generated build/test output. Build scripts regenerate scene and bundle; asset-library stays read-only. No C# changes are included.

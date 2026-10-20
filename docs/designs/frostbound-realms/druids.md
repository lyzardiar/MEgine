# Original Night Elf Druid production and forms

Author: MiYu

The native game supports Druid of the Claw/Bear and Druid of the Talon/Storm Crow forms. Knowledge and Wind Ancients use original meshes, team materials, sampled node tracks and rooted/uprooted clips. The shared asset library is read-only. New generated dependencies have source hashes and independent reproducible import receipts.

| Unit | Source | HP before training | Damage before training | Producer |
| --- | --- | ---: | ---: | --- |
| Druid of the Claw | edoc | 430 | 20.5 | Ancient of Lore, eaoe |
| Bear | edcm | 810 | 29.5 | Claw transformation |
| Druid of the Talon | edot | 300 | 12 | Ancient of Wind, eaow |
| Storm Crow | edtm | 300 | 38 | Talon transformation |

Original Patch tables determine construction/training prices, timers, technology requirements, health, armor, weapon dice, movement, mana and command icons. Claw costs 255 gold/80 lumber/4 food/35 seconds; Talon costs 135/20/2/22. Claw requires a completed Tree of Ages. Lore construction additionally requires Hunter's Hall.

Training shares the three-slot production queue. Redc takes 25/35 seconds; Redt takes 60/75 seconds. Both cost 100 gold and 50/150 lumber. The second rank requires a Tree of Eternity. Research reserves no food, cannot be duplicated by another Ancient and refunds full price when canceled. Uprooting suspends the queue. Source Attack Dice effects change both the displayed average and deterministic attack rolls: master Claw averages 25.5; master Bear 36.5 before Wild upgrades. Wild attack/armor upgrades affect the animal forms through exact original bindings and do not affect the human forms.

Claw transforms after Master Training for 25 mana. Talon transforms after Adept Training for 50 mana. Commands use original F hotkeys and slot 11. Transformation prevents new orders, retains unit identity/food and uses the original Morph/alternate clips and geoset visibility. Crow attacks air units only. Landing requires clear ground and is canceled/refunded if the ground becomes occupied. Save/load and TCP reconnect retain transformation and research state; enemy research/queues remain private. The implementation uses the shared game protocol 113.

Web prevents a captured Storm Crow from starting its return to Druid form. The command rejects before spending mana or changing capture; the source slot 11 icon is disabled and the tooltip identifies Web. Mouse input, F and direct TCP orders enforce the same rule, including after save/load or reconnect. Expiry restores the original return icon and the 50-mana transformation.

This gate follows REA static evidence from the original `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`. Registration `0x6f5031f0` declares `Arav` with parent `Amor` (`0x6f53b860`). Raven Form vtable `0x6f9d0f20` uses `0x6f3dcd40` at `+0xcc`, `0x6f528cb0` at `+0x304` and `0x6f3ded20` at `+0x3dc`. It therefore participates in the same Web class filter, disable counter and order rejection described in [Stone Form](gargoyle-stone.md). Reproduce with `node scripts/probe-frost-rea-stone.mjs`: the `crow-morph-gates` group checks its type and dispatch slots alongside the shared Web groups. REA upstream, pinned version and update procedure are retained in [REA maintenance](../../../third_party/rea/README-MENGINE.md).

Four active spells and both Mark researches are implemented in `druid-spells.md`. Crow uses its original UnitData flight height of 240 source units (2.4 world units), with the selection ring on the ground and health bar above the model; see `druid-flight.md`. Exact original health-transfer and mana-regeneration effect semantics need runtime comparison: the game preserves health percentage across forms and applies the raw training mana-regeneration bonus additively. Crow finishes the form at the combined cast/morph timer; original takeoff/landing height transitions are pending. These choices do not establish complete Warcraft III parity.

Validation commands:

```powershell
python scripts/test-frost-druid-assets.py
node scripts/test-frost-druids.mjs
node scripts/test-frost-druids-client.mjs
node scripts/test-frost-druids-network.mjs
node scripts/probe-frost-rea-stone.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-crypt-web.mjs
node scripts/test-frostbound.mjs
node scripts/qa-frost-druids.mjs
```

Native evidence is recorded in `native-druids-qa.json`, `druids-human.png` and `druids-animal.png`. Agent input is used; physical mouse, audio listening and cross-machine multiplayer acceptance remain unverified.

The Web gate regression uses a real Crypt Fiend projectile to capture the Crow, exercises rejection without mana loss, preserves capture through save/load, and verifies paid transformation after expiry. Current native Web evidence belongs in `tmp/docs-artifacts/frost-crypt-web/native-crypt-web.json`; REA results belong in `tmp/docs-artifacts/frost-gargoyle-stone/`. This is source control-flow evidence plus MEngine runtime validation; it does not claim original Warcraft runtime comparison or resolve Web arriving during an already-started morph.

This stage passed 30 REA groups, 9 Druid gameplay groups, 2 generated Druid client groups, 3 actual TCP groups and 4 native Web groups, with zero native console errors. The 13 Stone gameplay and 4 generated Web client groups also passed. Tested native Main SHA-256 matches the generated source: `ad7aed77547557c4b0b11da31e6476e34ded258ebc6535d0c9f3f7b482ad8dd5`. The native process exited normally; its temporary runtime cache remains after an EPERM cleanup error recorded in the report.

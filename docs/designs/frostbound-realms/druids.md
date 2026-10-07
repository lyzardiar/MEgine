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

Claw transforms after Master Training for 25 mana. Talon transforms after Adept Training for 50 mana. Commands use original F hotkeys and slot 11. Transformation prevents new orders, retains unit identity/food and uses the original Morph/alternate clips and geoset visibility. Crow attacks air units only. Landing requires clear ground and is canceled/refunded if the ground becomes occupied. Save/load and TCP reconnect retain transformation and research state; enemy research/queues remain private. Protocol 47 rejects protocol 46 clients.

Four active spells and the two Mark researches are extracted with original icons and requirements, but remain unavailable in this checkpoint. They are the next implementation stage. Exact original health-transfer and mana-regeneration effect semantics need runtime comparison: this checkpoint preserves health percentage across forms and applies the raw training mana-regeneration bonus additively. Crow currently uses the engine's common flying height and finishes the form at the combined cast/morph timer; original takeoff/landing height transitions are pending. These choices do not establish complete Warcraft III parity.

Validation commands:

```powershell
python scripts/test-frost-druid-assets.py
node scripts/test-frost-druids.mjs
node scripts/test-frost-druids-client.mjs
node scripts/test-frost-druids-network.mjs
node scripts/test-frostbound.mjs
node scripts/qa-frost-druids.mjs
```

Native evidence is recorded in `native-druids-qa.json`, `druids-human.png` and `druids-animal.png`. Agent input is used; physical mouse, audio listening and cross-machine multiplayer acceptance remain unverified.

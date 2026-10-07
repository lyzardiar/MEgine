# Original Night Elf Druid spells and Marks

Author: MiYu

Druids use original ability rows, icons, command slots, hotkeys, casting points and backswing times. Lore/Wind Ancients research the Marks through their existing production queue. Protocol 48 prevents older clients from issuing incompatible commands.

| Ability | Mana | Cooldown | Range / radius | Effect |
| --- | ---: | ---: | ---: | --- |
| Roar, R | 100 | 0s | radius 5 | +25% weapon damage for 45s, refreshed without stacking; allied units only |
| Rejuvenation, E | 125 | 1s | range 4 | 400 health over 12s; allied/self/neutral organic units; requires Adept Claw Training |
| Faerie Fire, R | 45 | 1s | range 7 | -4 armor and target vision for 90s, heroes 60s; original default autocast with right-click toggle |
| Cyclone, C | 150 | 5s | range 6 | Ground organic enemy suspended for 20s, heroes 6s; unable to act, attack or take damage; requires Master Talon Training |

Claw Mark and Talon Mark each cost 25 gold / 100 lumber / 20s and require the corresponding Master Training. Claw Mark allows Roar in Bear Form. Talon Mark allows Faerie Fire in Storm Crow Form. Rejuvenation and Cyclone remain human-form abilities. Duplicate research is rejected, cancellation refunds the full price, and uprooting suspends production. Roar and Faerie Fire exclude structures.

Targeted spells approach a visible valid target, then spend mana at the original casting point. New orders cancel the uncompleted cast or remaining backswing. Source animations include human Spell Slam and Bear Attack Spell Alternate for Roar. Faerie Fire shares the target's current sight and reveals hiding while its debuff lasts. Cyclone lifts the unit, removes its ground collision and blocks orders and damage. Purge and Wisp Detonate remove these four effects. Save/load and authoritative TCP reconnect retain timers, targets, research and autocast settings; enemy queues/research/autocast settings remain private.

The effect importer preserves original RoarCaster, RoarTarget, FaerieFireTarget and CycloneTarget meshes, sampled particles, clips and conversion records. Original buff definitions specify overhead, chest, head and Cyclone ground attachment behavior. References use the sampled attachment marker when present, with bounds-based positions for missing markers. Rejuvenation reuses the existing original RejuvenationTarget. The shared asset library is read-only; extraction does not establish a free redistribution license.

Validation passed: 128 full regression groups, seven spell-rule groups, generated-client spell controls and TCP spell continuation. Asset validation verified 105 spell outputs and 456 Druid outputs; 468 distinct staged receipt/output/generator paths matched their SHA-256 signatures and exact path spelling. Native R/E/C keys, target clicks, payment, effects, Cyclone suspension, F5 continuation and M research queues/completion passed with zero shader rejections and normal editor exit. Bear Roar and Storm Crow Faerie Fire controls and animation clips were verified in the generated client. Native evidence lives in `native-druid-spells-qa.json`, `druid-spells-active.png` and `druid-spells-marks.png`; `druid-spells-validation.json` records the handoff and measured native timings.

Next parity work remains original form HP transfer, training mana-regeneration semantics, Storm Crow takeoff/landing transitions and Cyclone fall/landing transition. Cyclone currently lands at its original ground position when dispelled or expired. Physical mouse, sound listening, original-game side-by-side comparison and cross-machine LAN acceptance remain unverified. The overall Warcraft III, campaign, tower-defense, Dota and map-editor objective remains active.

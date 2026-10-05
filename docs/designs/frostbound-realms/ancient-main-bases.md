# Ancient main-base Root, Uproot and Eat Tree

Author: MiYu. Applies to completed canonical Night Elf Tree of Life / Ages / Eternity main bases in melee skirmish.

## Gameplay and controls

Select an Ancient and use the HUD Root/Uproot button or R. Both forms take 2.5 seconds. Orders are blocked during that transition. Rooted bases use fortified armor, occupy the full building footprint and produce workers. Uprooted bases use heavy armor and move at 0.4 world units per second with a 1.2-unit movement radius. The world-unit conversion is project-specific. Armor value remains two.

Paid worker queues pause during form changes and while uprooted, retaining payment and remaining time. Root resumes them. New training and main-base upgrades require the rooted form. Root checks the entire footprint for flat dry ground, trees, rocks, troops and other buildings, and checks again on completion. Batch Root reserves the footprint of every selected Ancient.

While uprooted, use Eat Tree or E, then click a living visible tree. The Ancient walks into reach, consumes the actual resource, triggers its falling mesh and restores 500 HP over 30 seconds. Eating again refreshes that timer without adding another recovery rate. Recovery continues through Root. The HUD shows remaining recovery and suspended training.

Moving bases retain building identity and do not become Town Portal passengers or staff targets. Worker dropoff, Town Portal destinations and staff return destinations require a rooted base. A portal whose destination becomes unavailable cancels at channel completion. Save/load preserves forms, transitions, movement orders, healing and paid queues, including a pending portal whose destination has moved after Uproot. Older canonical saves without form metadata restore as rooted. Legacy base rules remain compatible. TCP protocol is 39; client and server must use the same version.

## Assets

Three moving GLBs use the existing attributed Ancient bodies/crowns and the 15-joint Entangled Roots rig. Skin weights are transferred from the actual weighted body mesh. Foundation rocks are removed and crowns follow Spine Upper. Idle, Walk, Attack and Death are attributed source clips; Uproot, Root and EatTree are project-authored clips. They are not original Warcraft animations. Model names/icons retain the existing main-base identity when the rendered mesh changes.

`ancient-form-sources.json` records every input/output hash and clip. Attribution is in `Assets/Licenses/Entangled-Roots.txt` and `Wildwood-buildings.txt`. Reproduce with Blender 4.5.9 using `--background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/import-frost-ancient-forms.py`, then `node scripts/build-frostbound.mjs`. Two independent conversions produced identical hashes for all three GLBs.

## Validation and scope

`test-frost-ancients.mjs` checks exact timers, mobile clearance/static obstacle removal, production payment/pausing/resume, blocking terrain and bodies, late Root blockage, batch footprints, complete non-stacking recovery, tree fall, saved forms/orders/queues, legacy data and malformed metadata. It also checks named clip selection at 12/30 Hz for all tiers. `test-frost-ancients-network.mjs` uses real TCP sockets for complete form timers, rejected transition orders, private enemy queues/orders, mid-form and healing reconnection, actual resource consumption and rooted production. Its final production completion uses a controlled remaining timer; the two form durations run in real time. The combined rule/TCP suite reports 74 PASS checks.

`validate-frost-ancient-forms.mjs` verifies actual weights on every joint and native sampled positions at start/mid/end for all seven clips on all three tiers. It checks moving legs and shoulders/crowns, world-vertical morph movement, finite bounds and a falling death pose. Native geometry evidence is `ancient-forms-validation.json`. The MEngine assets integration suite passes three tests.

Native QA passed the actual Root/Uproot/Eat Tree HUD, walk and form pose bindings on all three tiers, blocked Root, resource fall/recovery, paused/resumed production, true-menu saves and editor F7 playtest. Material pipeline rejection count was zero. `ancients-native-qa.json` and `ancients-validation.json` record the exact accepted Main.js SHA. The packaged Player contains 905 files, preserves the original project storage identity and matches the native script and all 126 generated assets from the Ancient and user-supplied building manifests. The Player stayed alive and responsive for 30 seconds with zero logged errors; startup evidence is `ancients-player-smoke.json`. These automated checks do not constitute physical mouse or audio listening acceptance.

Only the three main-base Ancients receive these abilities. Nature's Blessing, Entangle Gold Mine and other Night Elf production Ancients remain outside this stage. The in-game editor places a rooted main base, whose abilities work in F7 playtest; initial uprooted-form authoring is not added. The wider Warcraft recreation remains incomplete.

References: https://classic.battle.net/war3/nightelf/buildings/treeoflife.shtml and https://warcraft.wiki.gg/wiki/Tree_of_Life_(Warcraft_III).

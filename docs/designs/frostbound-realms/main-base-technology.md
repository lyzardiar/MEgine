# Independent main-base technology

Author: MiYu. Protocol 37, base-technology save version 1.

Each completed main base owns a grade and upgrade timer. A newly placed expansion starts at grade 1. An idle base can upgrade while a different base also upgrades. Its existing model, name, supply and grade stay in effect until completion. Training and starting an upgrade exclude each other; cancelling returns 75% of the upgrade cost and preserves the completed base, its damage and rally point.

| Faction | Grade 2 | Gold / lumber | Grade 3 | Gold / lumber | Each upgrade |
|---|---|---:|---|---:|---:|
| Human | Keep | 320 / 210 | Castle | 360 / 210 | 140 s |
| Orc | Stronghold | 315 / 190 | Fortress | 325 / 190 | 140 s |
| Night Elf | Tree of Ages | 320 / 180 | Tree of Eternity | 330 / 200 | 140 s |
| Undead | Halls of the Dead | 320 / 210 | Black Citadel | 325 / 230 | 140 s |

Fresh melee bases use the Classic-guide hit points: Human 1500/2000/2500, Orc 1500/1600/1800, Night Elf 1300/1700/2000, Undead 1500/1750/2000. Completing an upgrade adds the grade's hit-point increase while retaining existing damage. Authored health overrides and legacy saved health remain intact.

Available technology is derived from the highest grade among living, completed friendly main bases. Losing the advanced base changes availability immediately. Existing units, earned research and previously accepted training/research queues survive the loss. New purchases, recruitment, research and production use the current availability. Sanctuary and Preservation staffs choose the actual highest-grade completed base, then its stable ID.

The HUD provides the next building's name, cost and duration, a cancellation button during upgrading, and the selected base's independent grade and countdown. Visible enemy bases reveal their completed appearance and grade; their timer and global technology remain private. Saves and reconnects preserve each timer exactly.

Legacy saves assign their team grade to each completed base and grade 1 to unfinished expansions. An active shared upgrade attaches to the lowest-ID surviving completed base, retaining its original remaining seconds, paid-cost basis and simultaneous legacy queue. If no completed base survives, there is no building to continue that upgrade. Subsequent upgrades use the Classic table. Derived team grades are recalculated rather than trusted from the save.

Run `node scripts/test-frostbound.mjs` for rule and TCP acceptance, and `node scripts/qa-frost-base-tech.mjs` for isolated Release QuickJS, Agent HUD input, meshes and actual pause-menu save reload. Shared-rule tests advance the full 140 seconds; native QA checks the 140-second schedule and saved pending timers, then uses valid authored 1-second-remaining saves to exercise completion and model transitions. The source references and HTML SHA-256 values are in `main-base-provenance.json`.

This stage covers main-base upgrades and hit points. Base construction costs and durations, racial main-base attacks and abilities, complete technology prerequisites, dedicated original-quality art, campaigns, classic map contents and full editor behavior remain work for subsequent stages. Native Agent input does not establish physical-input, audio, cross-machine LAN or stable Player performance acceptance. The full recreation remains incomplete.

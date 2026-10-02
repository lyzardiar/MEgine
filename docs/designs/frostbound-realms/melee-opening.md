# Default melee opening

Author: MiYu

Default skirmishes start with 500 gold and 150 lumber. Kingdom, Warclan and Wildwood begin with a main base and five idle workers. Revenant begins with a main base, a Haunted Mine on the nearest local deposit, three idle Acolytes and one idle Ghoul. There is no prebuilt barracks, supply building or hero. The client initially selects a worker; gathering, construction and the first free altar hero use normal player commands.

Completed halls provide 12/10/10/10 food by faction, supply buildings provide 6/10/10/10, and the melee cap is 100. Other game modes keep their existing opening resources and supply. Maps serialize `startingWood`, clamped to 0–2000; missing values default to 150 in melee and 250 in other modes. Save restoration retains team treasuries and active worker/production orders.

The AI searches legal sites for its altar, supply building and barracks, assigns gold miners and lumber workers, and recruits the selected hero class first. Four-faction default-map tests exercise the opening without adding battle actors or increasing resources. Combat tests declare their authored units and lumber budgets using `scripts/frost-battle-fixture.mjs`; this helper never replaces `Frost.create` globally. The client and server require protocol 21.

## References

- [Blizzard.j melee initialization](https://raw.githubusercontent.com/lep/jassdoc/master/Blizzard.j): TFT resources, faction starting armies and idle-worker creation.
- [Town Hall](https://classic.battle.net/war3/human/buildings/townhall.shtml), [Great Hall](https://classic.battle.net/war3/orc/buildings/greathall.shtml), [Tree of Life](https://classic.battle.net/war3/nightelf/buildings/treeoflife.shtml), [Necropolis](https://classic.battle.net/war3/undead/buildings/necropolis.shtml): initial hall supply.

## Scope still required for the full recreation

Town Portal Scrolls and their channels, Night Elf entangled mines, original faction-specific worker statistics and building costs/times, the full original hero roster, campaigns and complete classic TD/Dota maps remain unfinished. The faction and hero names currently use the sample roster. The existing terrain, foliage and building assets are real 3D meshes, but their visual fidelity still varies by asset. This stage completes the default opening described above; the full Warcraft III recreation remains active.

## Validation

- `node scripts/test-frostbound.mjs`: full rules and real local TCP suite passed, including untouched four-faction default opening and old-protocol rejection.
- `cargo test -p mengine-editor-host --test frost_sample`: 4 passed / 0 failed.
- `node scripts/qa-frost-melee-opening.mjs`: actual native UI passed four default armies, initial worker selection, explicit gold/lumber gathering, altar construction, free first-hero recruitment using its full 55-second duration, saved production, hero shortcut and live default AI construction/training. This uses Agent input and a copied sample with telemetry instrumentation; no armies/resources/AI overrides. Physical mouse/audio acceptance is unverified. Shader rejections: 0.
- Windows package: 715 files; content SHA-256 `fab4e3d8d02cb5582d45a8e26d8d67643e129a3a7f5b56f7a1ab54372786ad45`. Package hashes and 30-second responsive Player startup passed, with zero logged errors.

Evidence: `melee-opening-validation.json`, `melee-opening-native.json`, `player-smoke.json` and seven `melee-*.png` captures from this stage. The packaged Player is `samples/frostbound-realms/Builds/windows-x64/Frostbound Realms.exe`.

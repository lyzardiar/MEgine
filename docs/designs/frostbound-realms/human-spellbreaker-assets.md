# Spell Breaker source effects

Author: MiYu

`scripts/import-frost-human-spellbreaker-effects.py` converts the original `SpellBreakerAttack.mdx` and `ControlMagicTarget.mdx` with their three source textures. The signed receipt records five source files and 45 generated files, including asset and material metadata. `runtimeIntegrated` is false: this phase supplies reproducible effects; Feedback and Control Magic gameplay are pending.

Feedback uses its original particle emitter: Birth lasts 2.1 seconds with 27 sampled frames and 39 sampled particles. Control Magic retains all four animated geometry parts; Birth lasts 2.2 seconds with 28 frames. Geometry and particles have separate conversion paths. The W3ModelViewer MIT notice covers the conversion library; it does not grant a license for Blizzard game assets.

`python scripts/test-frost-human-spellbreaker-assets.py` verifies source and output hashes, generator and binary identities, GLB structures, metadata completeness, animation catalogs, independent byte-for-byte regeneration, modified-output protection and corrupt-source rejection. The test writes `human-spellbreaker-assets-validation.json`. Editor rendering and original-runtime gameplay remain unverified for these effects.

## Gameplay evidence

The existing `human-sanctum.json` preserves the original `Afbk` and `Acmg` source rows. The [official Spell Breaker reference](https://classic.battle.net/war3/human/units/spellbreaker.shtml) states that Feedback burns 20 mana from ordinary units or 4 from heroes, deals damage equal to the actual mana burned, and does not affect spell-immune units. Control Magic controls summoned units and Orc wards, costs mana in proportion to health, and requires its research.

Feedback physical armor treatment and the complete Control Magic charge/health formula require original-runtime measurements. Source values `Cost1=25`, `DataB1=0.45`, `DataC1=1` alone do not establish whether the charge uses current or maximum health or how health adjustment works.

[Warsmash PR 100](https://github.com/Retera/WarsmashModEngine/pull/100), head `ecff558794ca25b283fc1952a1d7955da780e986`, declares a MAGIC bonus for Feedback in `AttackReplacementPassivesNonItemLowPriority.json`, but `CBonusDamage.java` passes `primaryDamageType` to the armor calculation. This conflicting simulator implementation is insufficient to establish original Warcraft behavior.

An owned temporary map was generated outside the repository using a copied Amazonia map and replacement JASS. MPQ script roundtrip passed. Launching the installed 1.27 executable produced no measurement file; consequently no gameplay formula is treated as verified. The owned process received a graceful close request. Further original-runtime probing must establish script execution and result-file output before interpreting skill values.

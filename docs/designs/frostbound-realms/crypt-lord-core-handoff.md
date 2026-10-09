# Crypt Lord authoritative Impale and Carapace

Author: MiYu

The authoritative simulation now supports source Ucrl recruitment/attributes, ranked Impale and Spiked Carapace, deterministic saves and private public-state projections. `cryptLordVersion: 1` opts into this development stage. The product default remains 0 until Carrion Beetles, Locust Swarm and client presentation are integrated; the current protocol is 73. The generated product bundle includes the source profile and this simulation code. This stage does not expose a partially implemented Crypt Lord in the normal product hero roster.

Impale retains the original .4s cast point, 6-unit wave distance/.3s wave time, 1s airborne interval, rank-specific damage and ordinary/hero ground stun durations. It sweeps the wave segment between simulation ticks, hits each eligible organic ground enemy once, interrupts pending casts and preserves ordinary orders/routes. The airborne interval grants invulnerability and a 2.25-unit sine lift. Landing removes invulnerability and applies magic damage; the ground stun then continues. Released waves and effects continue after the caster moves or dies. Source IDs/origin/timing/hit lists are removed from opponents' public wave data; unit effects expose remaining times without source identity.

Carapace updates source armor when learned, reflects eligible enemy melee attack raw damage using DataA, and applies DataB to incoming melee damage. Reflection uses the source Spells hero category factor 0.70, bypasses numerical attacker armor, follows `MagicImmunesResistThorns=0`, and does not recursively trigger Carapace. Fully absorbing shields still reflect the raw incoming melee hit.

Source evidence distinguishes documentation and reimplementation from original runtime measurements:

- [Blizzard Classic Crypt Lord](https://classic.battle.net/war3/undead/units/cryptlord.shtml) describes Impale's ground targets and the enemy melee restriction for Carapace.
- [Warsmash Impale](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/core/assets/abilityBehaviors/undeadHeroUnitActives.json#L437) uses consecutive airborne/ground stun phases, landing magic damage and `225 * sin(hgt)` fly height.
- [Warsmash thorns listener](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/core/src/com/etheller/warsmash/viewer5/handlers/w3x/simulation/combat/attacks/listeners/CUnitDefaultThornsListener.java#L21) reflects raw `damage` with SPELLS/DEFENSIVE, without triggering another normal melee reflection.
- [Warsmash damage handling](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/core/src/com/etheller/warsmash/viewer5/handlers/w3x/simulation/CUnit.java#L2899) bypasses numerical armor for DEFENSIVE damage while retaining attack/defense category factors.
- [Warsmash stun behavior preservation](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/core/src/com/etheller/warsmash/viewer5/handlers/w3x/simulation/CUnit.java#L745) saves and restores interrupted behavior; this supports preserving normal attack and work orders.

The fixed Warsmash commit is an independent open-source recreation. It does not prove Blizzard runtime parity. Original collision boundary details, immunity transitions and special channel behavior still require original-game measurement.

Validation:

- `node scripts/test-frost-crypt-lord-core-suite.mjs`: 14 scripts, 106 PASS groups, 4776ms, three workers. Includes new Impale/Carapace, source profile/camera and affected Dreadlord/Lich/Death Knight/Tauren/Mountain King/Keeper/Blood Mage/Demon Hunter/Dryad paths. `crypt-lord-core-validation.json` records source and bundle hashes.
- `node scripts/qa-frost-crypt-lord-core-runtime.mjs`: final generated code executes source recruitment, airborne protection/private state, landing damage/ground stun, deterministic save continuation, raw melee reflection and full-absorption reflection in the real native JavaScript runtime. `native-crypt-lord-core-runtime-qa.json` records exact final hashes, four checks, zero console errors, normal editor exit and fixture/storage removal.
- Independent read-only review also exercised Impale's fatal landing into Tauren reincarnation, immediate caster/item rejection and magic-immune melee reflection. Main tests cover reflection recursion and retained attack/repair orders after stun expiry.

Next:

1. Implement corpse-consuming ranked Carrion Beetles, manual/autocast commands, summon lifecycle and actual Abu2/Abu3 burrow forms. The fixed Warsmash `RaiseDead.json:170` replaces the oldest summon above DataE and uses permanent buffs for Dur=0; original-runtime replacement/autocast boundaries remain to be measured.
2. Implement moving source uloc entities, release interval, per-target limits, damage accumulation and return-to-hero healing. The fixed Warsmash version has no useful AUls implementation; source return-limit semantics need independent evidence.
3. Connect source-scaled bodies, command cards/hotkeys, spell/attachment effects and the animated live portrait; promote the version default and protocol when the full hero is ready. Rebuild and verify product presentation, strict save/network paths and same-machine TCP acceptance.

Full Crypt Lord gameplay/client integration, cross-machine networking, physical input/audio, standalone packaging and original Warcraft runtime parity remain incomplete.

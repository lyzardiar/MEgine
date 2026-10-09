# Lich original rules and effects

Author: MiYu

2026-10-09. Original Ulic body and portrait already exist in the Undead hero catalog. This stage prepares the Lich profile, four ranked spell definitions, original N/F/R/D cards, separate Frost Armor on/off icons and ten original source effects for gameplay integration. It changes no current generated Main scene/script and does not make the Lich playable yet.

The profile preserves INT as the damage attribute, 475 initial maximum life, 300 maximum mana with 100 initial mana, ranged ground/air attack, range 6, missile speed 9 with homing, 0.46 attack damage point, 0.4 spell cast point, source hover height and blight regeneration. Original AI learning is Nova, Armor, Nova, Ritual, Nova, Decay, Armor, Ritual, Armor, Ritual.

| Ability | Original field mapping |
| --- | --- |
| Frost Nova AUfn | DataA = 50/100/150 area damage; DataB = 100 specific target damage. Radius 2, range 8, ordinary chill 4/6/8 seconds, hero chill 2/3/4 seconds. |
| Frost Armor AUfu | DataA = 45-second armor duration; DataB = 3/5/7 armor. Dur/HeroDur = 5-second melee-attacker chill. Original frostarmoron/off orders and icons are retained. |
| Dark Ritual AUdr | DataA = .33/.66/1 life-to-mana conversion; DataB = 0 life conversion; DataC/DataD conversion ratio switches = 0; DataE target-survival switch = 0. Cost 25, cooldown 15. |
| Death and Decay AUdd | DataA = .04 maximum life per second; DataB = 1 building reduction, not a tick interval. Duration 35 seconds, radius 3, range 10, cost 250, cooldown 150. XUdd includes the original area model and loop sound declaration. |

Original global Frost constants reduce movement by .5 and attack speed by .25. AbilityMetaData, WorldEditStrings, MiscGame, common.ai and undead.ai provide field meanings and AI provenance. Static field labels and target masks do not establish original engine execution.

Effects include LichMissile, FrostNovaTarget, FrostDamage, FrostArmorTarget, FrostArmorDamage, DarkRitualCaster, DarkRitualTarget, DeathAndDecayTarget, DeathAndDecayDamage and the embedded Lich emitters. Five source effects have emitters without geosets; the importer declares them as particle-only and verifies that classification. Four spell models contain animated geometry; the existing hero catalog supplies the original body. Pure-geometry preview sampling selects a visible source pose for DarkRitualTarget as well as particle-rich frames for emitters.

Validation: profile/browser/CommonJS parity, 202 fingerprint-verified files, source/generator/binary hashes, deterministic texture GUIDs, native parsing of ten effects, 42 native geometry pose samples, offline byte-identical rules/effects reproduction using cached converter tools, modified-output rejection and corrupt-source rejection. Native 47-entity source preview passes with zero console errors and shader rejections; its screenshot was visually reviewed, and owned editor exit and fixture/storage cleanup completed normally. See lich-assets-validation.json and native-lich-assets-qa.json.

The shared G:/work/github/MEgine/asset-library was not modified. Source archives and source SHA-256 records are retained in the receipts; original ownership notices and converter MIT license are preserved. Extraction does not establish free redistribution rights.

Next: integrate Lich recruitment/versioned saves, actual ranged attacks, Nova cast/area damage/chill, Armor buff/melee trigger/autocast, Ritual sacrifice/mana conversion, and interruptible Decay channel/area damage/tree destruction. Connect source body/portrait/height, cards, animation and effects; verify strict saves, dispel/ownership/privacy, actual TCP and generated client/F5 before native gameplay acceptance. Generic legacy fixtures that manually alter faction/stats must explicitly disable the source Lich gate. Full Warcraft recreation, including the remaining heroes, campaign, original editor, cross-machine multiplayer and classic TD/Dota parity, remains active and incomplete.

Original-runtime measurements are still needed for Nova primary-target A+B behavior, Ritual current/maximum-life basis and payment/refund ordering, Decay tick timing and building reduction execution, Frost stacking/immunity and Armor automatic targeting/default state. This stage does not claim that parity. Rendering uses the sampled viewer solver; native acceptance does not prove the original Warcraft particle solver.

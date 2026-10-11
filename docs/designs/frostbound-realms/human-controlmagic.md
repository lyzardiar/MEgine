# Control Magic source contract

Author: MiYu

The original Warcraft III `Game.dll` version `1.27.0.52240` establishes the required mana as `Cost1 + DataB1 * (DataC1 != 0 ? currentHp : maxHp)`. The retained Frozen Throne row has `Cost1=25`, `DataB1=0.45`, and `DataC1=1`, so it selects current HP. DataC selects a health operand; it does not add or restore health. The generated catalog exposes `useCurrentHealth=true`; retained Chinese editor labels are original source text.

The official [Spell Breaker reference](https://classic.battle.net/war3/human/units/spellbreaker.shtml) confirms current HP, summoned targets, Orc wards and research at the Arcane Sanctum. The [1.31 patch notes](https://us.forums.blizzard.com/en/warcraft3/t/1-31-0-patch-notes/5721) distinguish the additional mana cost from the fixed cost. The binary evidence below establishes the full expression for the installed original version; it does not import later Reforged balance values.

## Reproducible charge evidence

`scripts/probe-frost-controlmagic-binary.py` accepts an externally supplied owned binary, authenticates its SHA-256 and RTTI, checks the field loader and virtual call chain, then runs the original charge helper in an x86 emulator. The only substituted functions are the two target-health getters, which supply independent current/max operands. The original static-cost getter, data getters, and software float multiplication/addition execute unchanged.

```powershell
python -m pip install --target <isolated-dependency-directory> pefile==2024.8.26 capstone==5.0.9 unicorn==2.1.4
python scripts/probe-frost-controlmagic-binary.py --binary <owned-Game.dll> --dependencies <isolated-dependency-directory> --report docs/designs/frostbound-realms/human-controlmagic-binary-validation.json
```

The supported binary SHA-256 is `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`, preferred image base `0x6f000000`. The repository contains no original executable or dependency wheels. The report records function-range hashes and the selected source-row hash. An unsupported or modified binary fails before emulation or report writes. Dependency versions identify the installed distributions; the Capstone 5.0.9 wheel exposes runtime version 5.0.7, recorded separately.

| Evidence | Preferred virtual address | Meaning |
|---|---|---|
| Control Magic vtable | `0x6f9cb5e0` | RTTI identifies `CAbilityControlMagic` |
| Charge helper | `0x6f49f5a0` | Adds static and health-dependent charges |
| Virtual slot 219 | `0x6f49f0c0` | Reads integer Cost and converts it to float |
| DataB loader/getter | `0x6f68a0ff` / `0x6f3f7470` | Level record offset `0x24` |
| DataC loader/getter | `0x6f68a12e` / `0x6f3f74d0` | Level record offset `0x28` |
| Current HP getter | `0x6f667a40` | CUnit virtual offset `0x12c`; also called by GetWidgetLife |
| Maximum HP getter | `0x6f667b40` | CUnit virtual offset `0x130`; GetUnitState index 1 |
| Float multiplication/addition | `0x6f0527e0` / `0x6f0529d0` | Original software float arithmetic |

The zero constant at `0x6fbb81d4` lies in the PE's zero-filled virtual data. The probe reads the mapped image rather than treating its RVA as a raw file offset. DataC's zero/nonzero comparison selects maximum/current HP respectively.

Ten CPU cases passed, including independent HP operands, DataC zero and nonzero, changed fixed cost and ratio, and a zero fixed cost. Examples from the original software arithmetic:

| Current HP | Maximum HP | DataC | Original helper charge |
|---:|---:|---:|---:|
| 5 | 525 | 1 | 27.249998092651367 |
| 100 | 525 | 1 | 69.99999237060547 |
| 500 | 525 | 1 | 249.99998474121094 |
| 525 | 525 | 1 | 261.2499694824219 |
| 100 | 525 | 0 | 261.2499694824219 |

The fixed charge matters: a fully healthy level-one Water Elemental costs over the Breaker's normal 250 mana. Software float rounding also matters near affordability boundaries. The helper accepts operands; these cases do not establish live target eligibility or observe mana deduction.

## Timed-life behavior

Original execution at `0x6f4ac8e0` looks up the target's `BTLF` timed-life buff via `0x6f511fa0` and `0x6f46f440`. An ordinary active BTLF has virtual offset `0x1d8` returning zero and buff flag `0x80` set. That path reads remaining time with `0x6f511dd0`, resets the existing timer through virtual offset `0x34c`, and skips creation of Bcmg. It preserves the original remaining lifetime.

A different path cancels and removes the old BTLF, then creates Bcmg; a target without BTLF can also receive the new buff. The new buff uses normal `Dur + ability[0x9c]` or hero `HeroDur`. The normal source duration is 60 seconds. The constructor initializes `ability[0x9c]` to zero; this is a duration adjustment field, separate from DataC. Its modifier sources are not fully traced.

The BTLF and Bcmg vtables share timer setup and attachment functions, but differ in their class identities and virtual offset `0x358`. Integration must preserve timed-life provenance and distinguish existing finite lifetime from the new-duration path. A permanent summoned unit must not silently keep infinite lifetime merely because its original summoner did not provide an expiry.

## Gameplay integration requirements

The retained `Rhss` research requires Arcane Vault and Castle, costs 75 gold / 75 wood, and takes 45 seconds. `Acmg` occupies slot 9, hotkey C, range 7 and cooldown 5; the Breaker has cast point 0.3 and backswing 0.51. It is a manual unit-target spell.

Ownership changes retain original summoner, source identity/rank, actual stats and expiry while updating control, orders, navigation and visibility. A private ownership history validates original source faction and repeated captures. Wolves and beetles that have transferred ownership are excluded from original recast/replacement limits. Captured Nature research and generic attack upgrades preserve their source values. Object buffs retain their application-team marker; Slow Poison applications and Faerie Fire retain recipient provenance separately from damage-source attribution. New buff applications and Spell Steal use their new recipient. Launched projectiles keep their launch-time team, and post-capture projectiles record source faction separately from combat allegiance.

Gameplay uses protocol 89 and sibling `humanControlMagicVersion` 0/1. New skirmishes with Spell Steal enabled default to 1; missing saved fields restore to 0, preserving earlier saves. The source slot 9/C command requires Rhss; payment and eligibility are rechecked at release after the 0.3-second cast point. Manual casting precedes Spell Steal autocast, with a 0.51-second backswing and 5-second cooldown. The mana helper truncates positive float32 products and sums and matches the four retained original CPU cases at 5/100/500/525 HP. Existing finite expiry is preserved; permanent beetles receive 60 seconds. Enemy organic summons and wards are eligible, including neutral summoned creatures up to level 5; immune/invulnerable profiles and hero illusions are excluded. The private history is bounded to 256 transfers per unit for save validation. Public/TCP snapshots expose current control and visible cast/effect timing while removing private history and enemy cooldown/cast details.

57 regression entrypoints pass, including actual five-source summon casts, old/new launched missiles, real Dryad poison, repeated control, buff transfer, malformed provenance, generated C-key input and TCP authority/reconnect/fog. Native Editor playback passes 44 steps with four original ControlMagicTarget geometry parts, unchanged timed life, save continuity and visual expiry; console/material errors are zero. The scene retains all 9,014 earlier entities and adds five inactive effect templates (9,019 total). Reports: `human-controlmagic-validation.json`, `native-human-controlmagic-qa.json`, `human-controlmagic-products-validation.json`.

Full original-runtime casts, ownership side effects, expiration/death behavior and the affordability boundary remain unverified in a running Warcraft process. Native acceptance used bridge playback; physical input, standalone Player and cross-machine LAN remain unverified.

An independent read-only review confirmed the field loader, JASS current/max getter identities, arithmetic and both lifetime paths. Its separate original-helper emulation passed 3 cases. The primary probe independently records 10 cases in `human-controlmagic-binary-validation.json`.

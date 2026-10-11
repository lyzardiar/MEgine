# Control Magic source contract

Author: MiYu

The original Warcraft III `Game.dll` version `1.27.0.52240` establishes the required mana as `Cost1 + DataB1 * (DataC1 != 0 ? currentHp : maxHp)`. The retained Frozen Throne row has `Cost1=25`, `DataB1=0.45`, and `DataC1=1`, so it selects current HP. DataC selects a health operand; it does not add or restore health. The catalog's existing `currentHealthAdjustment` name and Chinese editor label must not be interpreted as a health adjustment when integrating gameplay.

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

Ownership changes must retain original source identity/rank and stats while updating control, allegiance, orders and visibility. Source validators for Water Elementals, Spirit Wolves, Treants, Carrion Beetles and Serpent Wards currently assume the summoner and summon share a team. Those relationships require explicit control provenance. Launched projectiles must retain their launch-time combat team, even after their source unit changes owner. Existing unit buffs also carry allegiance constraints and need a deliberate transfer policy.

The full feature still requires source-target eligibility, research-gated commands, cast-release affordability checks, ownership/provenance and lifetime handling, strict save validation, public-state filtering, TCP tests, original effect playback and native acceptance. No new gameplay command is exposed by this research phase. Full original-runtime casts, ownership side effects, expiration/death behavior and the software-float affordability boundary remain unverified in a running Warcraft process.

An independent read-only review confirmed the field loader, JASS current/max getter identities, arithmetic and both lifetime paths. Its separate original-helper emulation passed 3 cases. The primary probe independently records 10 cases in `human-controlmagic-binary-validation.json`.

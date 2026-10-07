# Original Dryad asset preparation

Author: MiYu

The sample now contains the original Dryad body, animated portrait, missile and Abolish Magic target effect, together with the original unit, ability and research rows. Gameplay integration is pending. This preparation does not add Dryad production or prove original-game poison behavior.

`scripts/import-frost-dryad-assets.py` imports four bindings into `dryad-models.json`, samples the Dispel Magic particles into `dryad-spell-art.json`, and writes `dryad-rules.json` and `dryad-sources.json`. The shared `asset-library` is read-only. The importer retains source animation tracks, team materials and billboard nodes; native Stand-pose bounds are measured for each binding. Source model scale is 1.0 and selection scale is 1.25; a uniform display size is not used as a source rule.

The importer produces 235 recorded files. Each output and original model/icon has its byte length and SHA-256 recorded. Repeated generation produces identical content. If an output has been edited after generation, the importer rejects the replacement before writing any sample output.

| Source rule | Original value |
| --- | --- |
| Unit | `edry` |
| HP / armor | 435 / unarmored |
| Damage / attack / cooldown | 17–19 / Pierce / 2 seconds |
| Attack range / movement speed | 500 / 350 source units |
| Maximum / initial mana / regeneration | 200 / 75 / 0.75 per second |
| Slow Poison | 4 damage per second; 50% move slow; 25% attack slow; 5 seconds, or 1 second on heroes |
| Abolish Magic | 50 mana; 500 range; 300 damage to summons; requires `Resi` |
| Magic Immunity | `Amim`, magic damage factor 0 |

`Aspo.DataD1=1` is preserved as raw source data. Its stacking-bit interpretation and repeated-hit behavior have not been accepted without measurement. The initial Abolish Magic autocast state is also unverified. Dryad data remains separate from the morphable Druid catalog.

## Original-game reference map

`scripts/create-warcraft-rule-reference.py` creates a fresh local measurement map from the installed Echo Isles template. Original map copies remain in ignored `tmp`; they are not part of this delivery. The MPQ writer is deterministic and its hash/block encryption, collision handling and file readback are tested against the separate pinned MPQ reader.

The map measures Claw/Bear HP transfer, four-form mana regeneration, Crow takeoff/landing and three Dryad poison cases. It records damage source identities and event times, pauses attackers after the required impacts, and measures a wounded Footman control for natural regeneration. The latest script explicitly configures two opposing players and displays progress. Its explicit native calls have been checked against the installed `common.j` and `Blizzard.j`; this symbol check is not JASS compilation.

`scripts/analyze-warcraft-rule-reference.py INPUT --output REPORT` accepts a completed measurement only when form IDs, accepted morph orders, 60 flight samples, observation intervals and per-attacker poison counts agree. Its six tests use synthetic data solely to verify the acceptance gate. Four-second poison observations after the final impact do not represent the entire lifetime of all poison effects. Source-pause behavior and the direct-hit threshold still require inspection of the real damage trace.

The installed reference build is the dzclient Warcraft III 1.27.0.52240 installation, with dzclient plugins. It is not described as an untouched retail installation. The default renderer failed with the original game's DirectX initialization dialog. An OpenGL launch created a responding Warcraft III process, but no measurement output or map-load confirmation was obtained. Desktop activation returned `0x80070005`; capture returned `0x80070057`. Consequently no original runtime measurements, JASS compile result or native Dryad visual acceptance are claimed.

## Validation

- MPQ writer: 3 tests passed.
- Measurement acceptance gate: 6 tests passed, using synthetic data.
- Dryad files: 235 hashes checked, byte-exact regeneration and edited-output protection passed.
- Existing Druid assets: 457 hashes and reproducible outputs passed; spell art: 105 outputs passed after refreshing the importer receipt.
- Existing Druid rules and spells: 8 and 7 groups passed.
- Full existing regression: 131 PASS groups; process exited successfully. This validates current MEngine behavior, not original-game equivalence.

Remaining work: obtain accepted original measurements; implement Dryad production, researched Abolish Magic, poison, immunity and original missile/portrait/effect rendering; validate saved games, generated clients, TCP behavior and the native scene. The overall Warcraft III recreation remains incomplete.

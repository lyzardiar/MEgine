# Textured Revenant ghoul

The ghoul uses Rosswet Mobile's [Thin Zombie](https://opengameart.org/content/thin-zombie-awake-zombie-asset), a textured humanoid undead with 3,340 triangles, 41 bones and a 1024 × 1024 color atlas. It is licensed under [CC-BY-3.0](https://creativecommons.org/licenses/by/3.0/). Source archives, the attribution page, original Blender file and texture are retained in `samples/frostbound-realms/SourceAssets/ghoul`; `ghoul-sources.json` records source and generated hashes. Runtime attribution ships in `Assets/Licenses/Rosswet-Ghoul.txt`.

`scripts/import-frost-ghoul.py` runs in Blender 4.5.9 with `--background --disable-autoexec --python-exit-code 1`. It normalizes transforms and height, limits skin weights to four, samples the original IK animation and exports Idle, Walk, Attack, Death and Harvest clips. An authored Cannibalize clip adds feeding motion; all six clips have 20 native pose samples each. Reimport reproduces all five generated file hashes.

The live ghoul, training portrait and selected portrait use `RealGhoul`. Melee contact uses the attack clip's midpoint. Lumber gathering uses the Harvest clip while within reach of a tree; carrying a full load selects the locomotion model. Stop, death and save restoration retain the shared gameplay rules. Corpse healing and the Cannibalize research are documented in [Cannibalize](cannibalize.md).

Validation commands:

```text
python scripts/test-frost-ghoul-import.py
node scripts/test-frostbound.mjs
cargo test -p mengine-editor-host --test frost_sample
node scripts/render-frost-unit-icons.mjs --ghoul-sheet
node scripts/render-frost-unit-icons.mjs
node scripts/qa-frostbound.mjs --ghoul-only
node scripts/qa-frostbound.mjs --undead-economy-only
```

Evidence: `ghoul-import-qa.json`, `ghoul-poses.png`, `native-ghoul-qa.json`, `ghoul-combat.png`, `ghoul-death.png`, `native-undead-economy-qa.json`, `ghoul-lumber.png` and `ghoul-returning.png`. Native gameplay checks use Release rendering, QuickJS and Agent input. Physical mouse/audio and cross-machine multiplayer acceptance are outside these checks.

Free3D requests returned HTTP 403 during asset research; no Free3D download or asset is included. This ghoul moves the undead roster toward textured, anatomical artwork. Other stylized units remain, and the full Warcraft III recreation is still in progress.

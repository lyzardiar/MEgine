# Heavy undead artwork

The Revenant abomination uses [Troll Mauler by piacenti](https://opengameart.org/content/troll-mauler), licensed under [CC-BY-3.0](https://creativecommons.org/licenses/by/3.0/). Its broad torso, short legs and heavy arms distinguish it from the ghoul. The original Blender file and attribution page are retained in `SourceAssets/abomination`; `abomination-sources.json` pins their hashes.

`scripts/import-frost-abomination.py` combines the source medium mesh, cloth and eyes into a 6,370-triangle model. It preserves the source skin weights, normalizes them to four influences and adds a root bone to the original 33-bone rig. Authored Idle, Walk, Attack and Death clips provide 76 native pose samples. Arm rotation inheritance and a grounded whole-body fall keep the corpse on the terrain. These four clips are MEngine adaptations, not animations claimed from the original author.

The body, cloth and eye color maps share a 3072 × 2048 atlas; body and cloth normal maps share a second atlas. The live model, selection and training portraits use `RealAbomination`. The unit retains its existing gameplay statistics. The complete portrait atlas now contains 32 models. Runtime attribution ships in `Assets/Licenses/piacenti-Abomination.txt`.

Rebuild with Blender 4.5.9:

```text
blender --background --disable-autoexec --python-exit-code 1 --python scripts/import-frost-abomination.py
node scripts/build-frostbound.mjs
node scripts/render-frost-unit-icons.mjs --abomination-sheet
node scripts/render-frost-unit-icons.mjs
python scripts/test-frost-abomination-import.py
node scripts/test-frostbound.mjs
node scripts/qa-frostbound.mjs --abomination-only
```

Evidence is recorded in `abomination-import-qa.json`, `abomination-poses.json`, `native-abomination-qa.json` and `abomination-validation.json`. Screenshots show actual native rendering. Gameplay acceptance uses the Release editor, QuickJS and Agent input; physical mouse/audio and cross-machine LAN are not covered.

This is an adapted heavy undead model. The original game's stitched body, weapons, full roster, campaigns and complete visual fidelity remain unfinished. Other units still use stylized artwork. The full recreation goal remains active.

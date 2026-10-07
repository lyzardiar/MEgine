# Dryad implementation handoff

Author: MiYu

Current continuation: `slow-poison-handoff.md`. This file records the completed protocol-49 phase.

This stage adds playable Lore-produced Dryads, source ranged attacks and magic immunity, researched manual/automatic Abolish Magic, the original model/portrait/missile/effect bindings and the static original portrait camera. Protocol is 49. Implementation and acceptance boundaries are in `dryad-gameplay.md`; source and generated-product hashes are in `dryad-gameplay-validation.json`.

The final build passed 142 regression groups and isolated native MEngine acceptance. Native screenshots show the original dedicated portrait using its source camera. Automatic casting preserves Shift queues and resumed Attack Move/Hold, including competing target cancellation and saved casts. Enemy regeneration items can be dispelled. The owned editor and isolated QA fixture were cleaned up. Preexisting dirty scene, catalog, unrelated screenshots and `.gitattributes` are excluded from this stage's commit. The source scene was restored from `tmp/dryad-gameplay-scene-before.mscene`; regeneration remains `node scripts/build-frostbound.mjs`.

The protocol-50 continuation implements Slow Poison and the source-configured initial Abolish autocast preference. Accepted original-game measurement of poison stacking/repeated hits, cadence and immunity/dispel behavior remains necessary. Full Warcraft III recreation remains active and incomplete.

Original-game probe tooling is in `create-warcraft-rule-reference.py`, `warcraft-rule-reference.j` and `analyze-warcraft-rule-reference.py`. Latest unlaunched fixture: `tmp/MEngineReference-20261008-03/receipt.json`; previously launched OpenGL fixture: `tmp/MEngineReference-20261008-02/launch-opengl.json`. No original map load or probe output has been confirmed. Do not duplicate an existing Warcraft III process; recheck process state before reuse. The original installation is the dzclient Warcraft III 1.27.0.52240 installation with plugins. Previous desktop activation and capture failures were `0x80070005` and `0x80070057`.

Native QA timings are recorded per stage and command in `native-dryad-gameplay-qa.json`. Its roughly 80-second open and roughly 199-second acceptance include heavy-scene/editor/bridge work. Reuse one owned editor and isolate fixture changes when expanding native acceptance; keep independent rule/client/TCP tests parallel with that run.

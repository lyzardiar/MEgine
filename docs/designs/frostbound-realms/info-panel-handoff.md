# Warcraft information panel

Author: MiYu.

The selected-unit information card now uses original damage/armor icons. The four implemented source Night Elf heroes display canonical strength, agility and intelligence values with the source FDF geometry. Experience and skill points fit beside the attribute row; attack and armor numbers occupy bounded text rectangles with at least 5 px between icon and text. Portrait health/mana labels fit their bars. Production queues, ordinary-unit selection, multiple selection and the editor retain their layout and visibility rules.

The change adds six HUD frames at the end of the generated scene and preserves all existing entity IDs. Thirteen existing HUD frames change; gameplay, models, terrain and asset-library are unchanged. Generic heroes currently lack canonical source attributes, so the source-attribute row is shown only for the four supported heroes.

`info-panel-source-archives.json` records the original archive paths, precedence and SHA-256 of 27 retained BLPs. `info-panel-icons.json` contains 37 skin bindings and four explicit source-name mappings. `info-panel-sources.json` signs 57 source/output files, the importer, shared BLP decoder and source configurations. Blizzard's original asset terms apply. A separate output-directory rebuild produced identical bytes, and the importer rejected an edited output before writing any generated files.

Verification commands:

```text
python scripts/import-frost-info-panel.py --output tmp/info-panel-rebuild
node scripts/test-frost-info-panel.mjs
node scripts/test-frost-console-layout.mjs
node scripts/test-frost-warden-generated.mjs
node scripts/test-frost-production-ancients-client.mjs
node scripts/qa-frost-info-panel.mjs
```

`MENGINE_FROST_BUILD_OUTPUT=tmp/info-panel-scene-rebuild node scripts/build-frostbound.mjs` independently reproduces Main.js and Main.mscene. Native QA uses `D:/MEngineNativeQA/construction-build/release/mengine-editor-tauri.exe`; this stage needs no engine rebuild. The native report contains product/editor fingerprints, source-hero values, screenshots at 1024×768, 1280×720, 1920×1080 and 2560×1080, phase timings, logs and owned-instance shutdown/cleanup evidence. Screenshots require visual inspection in addition to the geometric assertions. Native Agent input does not prove physical mouse or audio acceptance.

The full Warcraft III objective remains active. Complete source gameplay for the other races, full campaign/editor parity, classic-map fidelity and cross-machine multiplayer acceptance remain unfinished. Continue toward those requirements; do not treat this information-panel stage as completion of the game.

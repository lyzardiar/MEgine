# Mirrored ridge entrances
Author: MiYu

The default Winterfall Basin and Supply Road layouts use two mirrored wooded ridges. Each ridge has a three-cell entrance from the lowland to the first shelf and a two-cell entrance from the shelf to the summit. The ten ramp cells leave the remaining perimeter as a continuous exposed cliff. The two-cell summit entrance admits the 0.9-unit bodies of all four siege vehicles and the MOBA siege creep.

The authored terrain, heights, relief, water, roads, resources, spawns and surface arrays are preserved. Only the ramp arrays change in the two templates. MOBA, TD, RPG and Highland Pass map contents are unchanged. Saved maps keep their authored ramp arrays. Protocol 26 and the shared native/JavaScript terrain geometry remain unchanged.

Rule checks move a hero, ballista, catapult, trebuchet, ram and siege creep through both entrances on each mirrored ridge and verify the elevated destination and save restoration. The full JavaScript/TCP suite checks the existing game and multiplayer behavior. Native QA uses an authored friendly hero with AI disabled, actual Agent pointer input, editor map save/load, summit ascent and game save/restore. Pointer projection reads the actual sculpted height.

`ridge-layout-before-native.json` and `ridge-before-ridge-overview.png` use the default-map simulation from d758eec with the same current renderer, terrain shader, camera, viewport and scene assets. `native-ridge-layout-qa.json` and the corresponding after images use the final layout. `ridge-layout-validation.json` records content parity, checks and package hashes. Screenshots are actual native rendering; physical input/audio and steady performance acceptance remain unverified. Full Warcraft III recreation remains incomplete.

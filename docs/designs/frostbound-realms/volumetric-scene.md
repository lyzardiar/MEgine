# Frostbound Realms: 3D scene presentation

Author: MiYu

Trees use full 3D meshes at close range and reduced 3D meshes at distance, including the surrounding forest. All LODs retain their seeded rotation, scale and PBR material. The strategy camera looks down at approximately 37 degrees. Buildings face 30 degrees toward the camera, and their scaled bounding corners fit inside their gameplay footprints; placement previews share that orientation.

Winterfall Basin and Supply Road include two mirrored wooded ridges, 104 raised cells and 58 slope cells. Base sites and the central crossing remain flat. The terrain meshes, picking, pathfinding, cliff visibility, construction validation and saves share the same authored heights. Terrain retains the existing tile-based terraces rather than a continuous heightfield.

Eight Wildwood structures use textured tree-creature, conifer, moss-rock and timber-house meshes. `scripts/import-frost-wildwood.py` generates their geometry and shared diffuse/normal/ARM atlas from existing pinned assets. `wildwood-sources.json` records input/output hashes and upstream attribution manifests. The tree creature is CC-BY-3.0; the Poly Haven scans and Daniel74 houses are CC0. Attribution covers the derived meshes, textures and native building icons.

Validation:

- Full Node rule and real TCP suite passed.
- Native QuickJS integration: 4 passed, 0 failed.
- Native 3D acceptance recorded 65 visible mesh trees, worker picking/movement, three Wildwood starting buildings and zero rejected material pipelines.
- Native terrain acceptance covered height painting, undo, map save/load, repeated editor playtests and a hero climbing a real ramp.
- Native faction acceptance checks all four starting building sets, materials, worker models, construction previews and portraits.
- Packaged Release: 715 hash-validated files, 30-second responsive startup, zero logged errors. Content SHA-256: `4ccc5b02ea2d667830f7c3931a2625dfacc7f056fa516b4983d5649ab4056aca`.

Images and reports: `3d-before-*.png`, `3d-*.png`, `native-3d-before-qa.json`, `native-3d-qa.json`, `native-terrain-qa.json`, `native-factions-qa.json`, and `player-smoke.json` in this directory. Baseline images reconstruct commit `5894a01` inside an isolated native QA project. Profiler snapshots include editor/bridge/capture work and multiple camera states; they are not a standalone frame-rate benchmark. Physical mouse and audio acceptance are not claimed.

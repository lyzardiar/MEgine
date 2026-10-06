# Original water animation and editor layout

The sample uses the 45-frame sequence named by the effective `TerrainArt/Water.slk`: `ReplaceableTextures/Water/Water00.blp` through `Water44.blp`, at 15 frames per second. Winter, Forest and Barrens use the source rows `WSha`, `LSha` and `BSha`, including their four shallow/deep RGBA colors. `Textures/Water*-0.blp` is a separate model texture sequence and is not used for this terrain surface.

`classic-water-sources.json` records all 46 originals, their source archives, byte counts and SHA-256 hashes, the generator hash, every runtime output and every decoded frame hash. The original files remain in `SourceAssets/WarcraftIII`. The runtime atlas preserves 128-pixel frames with two pixels of wrapped gutter on every side and corner. Attribution is in `Assets/Licenses/Classic-Water.txt`.

The dedicated `ClassicWater.mshader` samples this atlas on a common world-space lattice across terrain chunks. It uses the same shoreline cut and fog calculation as the classic ground shader. Gameplay and multiplayer phase comes from the authoritative simulation frame; single-player pause freezes it. The editor uses its local clock. Source tint transitions are adapted to the sample's river coverage; the source height is recorded but is not applied as an unverified world-unit conversion. Existing submerged riverbed geometry remains unchanged.

The editor's minimap, portrait, information and command controls each occupy their own bottom panel. Rendered rectangles and pointer hit regions share the same anchors. Minimap tiles and unit markers use the editor's actual minimap rectangle. The command panel stretches across the remaining width; its button grid follows the bottom/right corner. Window resize refreshes the UI in the first client tick. Editor metadata stays clear of the top-center day/night dial.

Reproduce extraction from a local installation using `scripts/extract-frost-classic.py --skip-terrain --out tmp/classic-water-export`, with one `--only-texture ReplaceableTextures\Water\WaterNN.blp` argument for each frame 00–44. Extract `TerrainArt\Water.slk` separately to `tmp/classic-water-table-export`. Run `python scripts/import-frost-water.py` and `node scripts/build-frostbound.mjs`. The importer checks every existing output before writing and preserves locally modified generated assets. `scripts/test-frost-water.py` also regenerates from the packaged originals without requiring the installed game.

Validation commands:

- `python scripts/test-frost-water.py`: source/output hashes, every original frame pixel, every gutter/corner, all source color rows, exact regeneration and edited-output protection.
- `node scripts/test-frostbound.mjs`: gameplay/client and real TCP regression suite. Client fixtures execute the generated startup script.
- `node scripts/qa-frost-water.mjs`: native three-palette renders, paint/undo, map/game saves, animation/pause, actual menu input, two authoritative clients and reconnect.
- `node scripts/qa-frost-console.mjs`: four original racial consoles, gameplay controls and editor containment/hit regions at 1280×720, 1024×768, 1920×1080 and 2560×1080. `--editor-only` reruns the editor portion separately.

Native results passed with zero rejected shader pipelines in `native-classic-water-qa.json`, `native-console-layout-qa.json` and `native-editor-layout-qa.json`. The editor report includes the tested source identity after the repository's Git filters. `native-classic-water-visual-qa.json` separately confirms that rendered pixels in the stationary river change between source animation frames. These use Agent pointer input; physical mouse and audio listening remain unverified. This stage does not establish a complete Warcraft III recreation.

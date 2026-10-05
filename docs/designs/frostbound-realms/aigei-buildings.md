# User supplied Warcraft building models

Author: MiYu.

The user supplied Aigei archive contains one `TitleRPG.max` scene, 34 TGA textures and one PNG. The pinned Blender MAX importer reads 330 mesh objects. This delivery converts 41 model groups (6,724 triangles), replaces 10 building variants, and retains the original UVs, material texture regions and transparency.

| Runtime model | MAX objects |
| --- | --- |
| KingdomHall | CityBuilding111 |
| KingdomHall2 | DalaranBuilding01 |
| KingdomHall3 | DalaranVioletCitadel1 |
| KingdomBarracks | CityBuilding101 |
| KingdomLodge | VillageBuilding01, VillageBuilding02 |
| KingdomTower | DalaranBuilding11 |
| KingdomAltar | City_Statue1 |
| KingdomWorkshop | CityBuilding131 |
| KingdomArcaneVault | ElvenVillageBuilding71, ElvenVillageBuilding72 |
| WildwoodLodge | ElvenVillageBuilding01 |

The three human main-base variants use city/Dalaran scenery chosen by this project. They are not the original Warcraft Town Hall/Keep/Castle assets. The package does not contain a complete set of the other racial production buildings. Their current models remain. The converted scene provides static meshes; MAX animation tracks are not imported. Construction progress and gameplay retain the existing engine behavior.

The other 31 catalog entries include city and elven houses, ruins, archery targets, walls, bridges, monuments, trees and rocks. The native editor can access their GLB and MMAT assets. They do not add new buttons to the in-game doodad palette or change bridge pathfinding.

`aigei-building-sources.json` records the archive hash, exact source object mapping, importer revision and all 123 generated file hashes. The archive does not include a redistribution license or CC0 declaration. Its included attribution is retained in `Assets/Licenses/aigei-warcraft-buildings.txt`.

## Reproduction

Use Blender 4.5.9 with `--background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/import-frost-aigei-buildings.py`, then `node scripts/build-frostbound.mjs`. The importer verifies the retained archive and pinned importer before conversion. Set `MENGINE_EDITOR_EXECUTABLE` and `MENGINE_QA_ROOT` to the Release editor and an isolated QA directory before running `node scripts/render-frost-faction-icons.mjs`.

## Validation

Two independent conversions produced identical hashes for all 123 generated files. Geometry checks passed for finite positions/normals/UVs, unit normals and valid triangle indices. The visual suite and all 72 rule/TCP checks passed, both with the working simulation and with the exact released protocol 38 simulation. Native Release QA checked all 10 live model/material bindings, ground placement, the actual worker construction preview and completed building, and save/load through the game menu. Shader rejection count was zero. All 35 building portrait slices are native renders of the runtime models.

The asset QA and Player use committed simulation rules from `04384735b4fbd10fbd9e70632bc58b4bf8f83a82`. The separate Ancient mobility draft remains in the worktree. `qa-frost-aigei-buildings.mjs` records this baseline and removes its observation fields before packaging. The Player retains the project's original storage identity. Physical mouse input and audio listening are not accepted by these automated checks.

The packaged Player contains 902 files. All file sizes/hashes and all converted assets match the validated native sample. The Player stayed alive and responsive for 30 seconds with zero logged errors.

# Winterfall river geometry
Author: MiYu

The river uses an opaque submerged gravel bed and an independently rendered transparent water surface. Both use the existing sculpted top contour. Dry ground, original top positions, navigation and protocol 26 are preserved.

`terrain4w:` contains the 244-character sculpted payload, 36 wet-cell flags and a final layer flag (0 surface / 1 bed). The surface is 0.04 units above the original top. The bed smoothly descends up to 0.75 units, with depth zero at dry-cell bounds. A one-cell halo preserves cross-chunk heights and normals. Meshes are cached; animated normals use a material parameter rather than new geometry.

The shared ground shader cuts the original top at the same smooth shoreline used by the bed and surface. Sculpted wall UVs explicitly mark cliff faces so bank cliffs remain visible. Existing six texture slots supply gravel and terrain detail. Water alpha ranges from 0.25 in shallows to 0.65 in deeper water, with moving normals and shoreline foam. Beds and water do not cast shadows; bed lighting avoids occlusion from the retained logical ground mesh. Unit shadows can still fall on the water surface.

Gameplay water phase follows `state.frame * DT`, including pause, saves and authoritative network states. Editor preview uses its local display time. Picking includes the 0.04 water offset at logical water cells. Ground units retain the impassable water rule and flying units retain their four-unit height offset.

Validation and rendered evidence are recorded in `native-water-qa.json` and `water-validation.json`. Full original Warcraft III tilesets, physical mouse/audio acceptance and steady performance acceptance remain outside this stage.

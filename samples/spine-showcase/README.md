# Spine 4.3 Showcase

Open this directory as an MEngine project. The main scene displays seven
official Spine examples together. Select a skeleton in Hierarchy to switch its
animation, skin, playback speed, tint, scale, or asset pair in Inspector.

`Assets/Scenes/UI.mscene` demonstrates the UI path: `Spineboy UI` is a direct
child of a screen-space Canvas and its `RectTransform` controls placement and
size. In any project, use `GameObject > UI > Spine Skeleton`, assign the
skeleton and atlas in Inspector, then choose its animation and skin. The same
control is available in Hierarchy's searchable `+` menu while a Canvas is
selected.

`Assets/Spine` contains the complete runtime-export set from the official Spine
Runtimes 4.3 branch for every example whose own license explicitly permits
redistribution. The files are grouped by example and include JSON, binary
`.skel`, straight-alpha and PMA atlases, and every atlas page used at runtime.
The upstream `spinosaurus` export has no atlas, so this sample includes its five
referenced images and a minimal atlas adapter.

The gallery scene demonstrates:

- Spineboy `run`
- Raptor `walk`
- Goblin Girl skin with `walk`
- Owl `idle`
- Alien `run`
- Coin `animation`
- Tank `drive`

All data reports Spine `4.3.75-beta` and is read by MEngine's pinned official
`@esotericsoftware/spine-canvas` 4.3 runtime. See `ASSET_LICENSE.md`, each
example's `LICENSE.txt`, and `SPINE_RUNTIMES_LICENSE.txt` before redistributing
or using these assets.

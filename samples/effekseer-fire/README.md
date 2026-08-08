# Effekseer Showcase

Open this directory as an MEngine project, then enter Play mode.
`Assets/Scenes/Main.mscene` shows a 3D world-space effect, while
`Assets/Scenes/UI.mscene` shows a depth-independent 2D/UI overlay as a direct
child of a screen-space Canvas through the same editor/player RHI path. Its
`RectTransform` controls placement and size, while `screen_scale` remains an
optional authored multiplier.

Open the Effekseer panel and select any effect in the asset list to switch the
preview. Its `3D` and `2D / UI` buttons preview the same asset in both render
modes. In any project, use `GameObject > UI > Effekseer Effect` (or the
Hierarchy `+` menu while a Canvas is selected), assign an `.efkefc` asset, and
lay it out with RectTransform. Root-level screen effects can still use the
normalized `screen_position`, `screen_scale`, and `sorting_order` fields.

From the repository root it can also be run with:

```powershell
npm.cmd run sample:effekseer
```

All 15 effects and their runtime dependency closure come from Effekseer's
official `EffectMaterials` repository at commit
`8bf8edfedb51ac09af3d4cf788cb81746ea75a82`:

- Fire: `ef_fire01`, `ef_fire02`, `ef_fire03`
- Holy: `ef_holy01`
- Ice: `ef_ice01`, `ef_ice02`, `ef_ice03`
- Lightning: `ef_lightning01`, `ef_lightning02`, `ef_lightning03`
- Hit: `ef_parts_hit01`, `ef_parts_hit02`
- Wind: `ef_wind01`, `ef_wind02`, `ef_wind03`

The repository contains 15 `.efkefc` files, 14 `.efkmat` files, 20 runtime
`.efkmodel` files, and 90 textures. Authoring-only FBX/source files are omitted
because the runtime never reads them.

Upstream declares all repository data CC0. The effects were authored for
Effekseer 1.7 and are loaded by MEngine's Effekseer 1.80 compatibility path.
Credits and the pinned source are recorded in `ASSET_LICENSE.md`.

Source: <https://github.com/effekseer/EffectMaterials>

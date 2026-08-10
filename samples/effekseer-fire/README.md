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

## Agent authoring workflow

`Assets/Effects/Combat.meffect` is the machine-readable semantic catalog. It
groups the 15 pinned binaries by gameplay purpose instead of moving them into
physical subfolders: compiled Effekseer effects retain authored relative paths
to `Textures`, `Materials`, and `Models`, so moving binaries would make the
sample fragile.

An Agent creates effects through one deterministic loop:

1. Query `effekseer.catalog` (MCP: `get_effekseer_catalog`) with prompt words,
   a purpose group, or tags.
2. Choose a returned preset or assemble up to 16 catalog layers.
3. Execute `effekseer.compose` (MCP: `compose_effekseer_effect`) in `world` or
   `screen` mode. The complete hierarchy is one scene Undo transaction; screen
   compositions use the existing Canvas/RectTransform path.
4. Capture Scene/Game output, then iterate scale, offsets, speed, start frame,
   and sorting. The Agent never edits or invents the compiled `.efkefc` format.

The first prompt-oriented presets cover a crimson thunder column, jade blade
storm, arcane multi-hit, cyan UI guard arc, and compact UI hit confirmation.
They are decomposed from the combat reference into reusable layers rather than
one unmaintainable full-screen effect.

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

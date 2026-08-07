# Spine showcase asset sources and restrictions

Source: <https://github.com/EsotericSoftware/spine-runtimes/tree/4.3/examples>

Pinned commit: `51d8d78b5414645875c2641630a6f4cdb2737440`

This sample includes all 27 official 4.3 example export directories that carry
an explicit per-example grant allowing their images to be redistributed when
the accompanying license is present:

`1-weight-and-mass`, `2-the-12-principles`, `3-timing-and-spacing`,
`4-wave-principle`, `5-squash-and-stretch`, `6-arcs`, `8-follow-through`,
`alien`, `celestial-circus`, `chibi-stickers`, `cloud-pot`, `coin`, `diamond`,
`food-app`, `goblins`, `mix-and-match`, `owl`, `powerup`, `raptor`,
`snowglobe`, `speedy`, `spineboy`, `spinosaurus`, `stretchyman`, `tank`, `vine`,
and `windmill`.

Each directory retains its upstream `LICENSE.txt`. Those licenses restrict the
images to non-commercial use and allow the Spine project files to be used as a
starting point for other work. Read the exact file before using an example.

The following public repository content is intentionally not copied:

- `dragon`, `hero`, and `spine-unity/footsoldier`: their asset licenses forbid
  redistribution.
- `7-anticipation`, the generic `export` directory, and `spine-unity`: no
  matching per-example redistribution grant was present at the pinned commit.
- Authoring `.spine` project files and images that are not needed at runtime.
  The `spinosaurus` export is the sole upstream exception: it has no generated
  atlas, so its five referenced images are included with a minimal atlas file.

The Spine Runtimes have separate licensing requirements. The exact upstream
runtime license is included as `SPINE_RUNTIMES_LICENSE.txt`. MEngine users must
review and satisfy the official Spine licensing terms; this inventory is not a
replacement for those terms.

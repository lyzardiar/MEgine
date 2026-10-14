# Authored title-screen visibility

The saved Frostbound scene enables the same 184 UI nodes as the first client script tick. Previously 1,529 UI nodes were enabled before Play, overlapping the pause, rename, network, options and gameplay panels. The scene generator now writes the correct initial activation and regenerates the script inactive-node lookup. Status notifications remain enabled; runtime menu transitions retain ownership of later activation.

Only 1,345 UI active flags changed in the 4,259-node authored scene. Entity identities, parents, transforms, render components and asset references are unchanged. Generation into a separate output directory reproduces Main.mscene and Main.js byte-for-byte; existing sidecar metadata is unchanged.

Validation commands:

- `node scripts/test-frost-menu-visibility.mjs`: first-frame parity, network/co-op TD, options, custom Dota start, HUD notifications, pause/resume, title return and map-editor region rename.
- `node scripts/test-frost-scene-groups.mjs`: hierarchy organization.
- `node scripts/test-frost-effect-pool-scene.mjs`: 902 pooled duplicates removed, retained authored data and 742 resource references preserved. This historical baseline predates 35 separately committed menu/route-label nodes; their exact names are asserted.
- `node scripts/test-frost-td-route-client.mjs` and `node scripts/test-frost-moba-layout-client.mjs`: gameplay layout regressions.

All five checks passed. The older crypt-lord menu suite is blocked by its fixed protocol-93 assertion; the current committed simulation protocol is 95. That suite is not counted as passed and no protocol was changed for this repair.

The screenshot's approximately 300 ms metric represented the idle Edit preview poll interval. The updated Profiler labels it separately from native render work and request-to-Canvas-upload time. Removing dormant panels reduces real work as well; it is a change to correct visible content, not a same-output rendering benchmark. Native timing and Release acceptance are recorded in title-preview-validation.json. These measurements are local preview samples, not gameplay FPS or physical screen presentation timing.

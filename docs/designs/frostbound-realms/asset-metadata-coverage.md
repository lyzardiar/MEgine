# Frostbound asset metadata coverage

Author: MiYu. Updated 2026-10-25.

Editor-recognized authoring assets and their `.meta` sidecars must be committed together. A missing sidecar is recreated with a random GUID when the project is opened, so leaving it out produces different identities on other computers. Preserve existing GUIDs and importer settings. Unsupported files and auxiliary `.sprite.json` files do not need sidecars. Runtime-imported `Maps/user-v*` and `WarcraftShared` remain local caches under the existing ignore rules.

Install the commit check once per clone, without replacing an existing custom hook configuration:

```powershell
npm run setup:git-hooks
```

Git then runs the metadata gate before committing. Clones using custom hooks must add `python scripts/check-frost-asset-meta.py` to their existing pre-commit hook. Python 3 is required; hooks and AGENTS rules complement the explicit check below.

Run before committing asset changes:

```powershell
python scripts/test-frost-asset-meta.py
npm run check:asset-meta
```

The checker reads tracked content from the Git index, including in sparse checkouts. It fails when eligible assets have missing, untracked or invalid metadata. `--write` creates only absent sidecars with path-derived stable GUIDs; stage the result before checking again. Existing metadata is never rewritten.

Coverage: the 2026-10-14 delivery added 1,481 sidecars. The 2026-10-25 audit found another 827 untracked sidecars beside tracked assets: 37 JSON, 291 material, 387 model, 107 texture, one scene, one script and three shader assets. These existing files are now included, without GUID or importer edits. All 10,915 supported, tracked Frostbound assets have valid staged sidecars. The 827 additions introduce no GUID collisions within this project. Four asset metadata tests and three material metadata tests pass. Audit inputs and preserved-byte hashes are local at `tmp/docs-artifacts/asset-meta-audit/`.

One untracked `Assets/Licenses/asset-sources.json.meta` has no source asset on disk or in Git; it is left untouched for separate review. It is not part of the 827-file delivery.

Before updating an older clone, preserve its locally generated metadata. If Git reports that untracked `.meta` files would be overwritten, use a metadata-only stash, then pull:

```powershell
git stash push --include-untracked -m "Backup local Frostbound metadata before update" -- ':(glob)samples/frostbound-realms/Assets/**/*.meta'
git pull --ff-only
```

Keep this stash until local scene/material references and import settings have been checked against the committed identities. It may contain locally authored settings and different GUIDs. Do not automatically pop it over the shared sidecars or delete it after pulling. This procedure does not stash other asset contents; if the clone also contains local references to those GUIDs, back up the associated work before updating.

Scope: this gate checks coverage and metadata schema, not global GUID uniqueness. The pre-existing metadata has 173 duplicate GUID groups across 402 files, including copies of shared effect textures and models. Their references require separate review before remapping. This verification does not claim a fresh editor-open runtime test.

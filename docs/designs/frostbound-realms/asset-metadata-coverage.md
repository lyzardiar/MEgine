# Frostbound asset metadata coverage

Author: MiYu. Verified 2026-10-14.

The repository includes the 1,481 previously missing sidecars for editor-recognized, tracked assets. These preserve the existing G:/work/github/MEgine GUIDs and importer settings. Unsupported files and auxiliary `.sprite.json` files do not need sidecars.

Run before committing asset changes:

```powershell
python scripts/test-frost-asset-meta.py
python scripts/check-frost-asset-meta.py
```

The checker reads tracked content from the Git index, including in sparse checkouts. It fails when eligible assets have missing, untracked or invalid metadata. `--write` creates only absent sidecars with path-derived stable GUIDs; stage the result before checking again. Existing metadata is never rewritten.

Validation: four asset metadata tests and three existing material metadata tests pass. All 1,481 added sidecars match their source bytes before Git line-ending normalization and introduce no GUID collisions.

Scope: this gate checks coverage and metadata schema, not global GUID uniqueness. The pre-existing metadata has 173 duplicate GUID groups across 402 files, including copies of shared effect textures and models. Their references require separate review before remapping. This verification does not claim a fresh editor-open runtime test.

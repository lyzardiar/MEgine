# Authored mesh patches

`MeshRenderer.mesh` accepts `meshpatch:Assets/Models/Tiles.mpatch#<cells>`. The native loader composes static triangle templates into a grid and uploads the resulting mesh through the existing renderer. All cells share the renderer's material. Positions receive uniform scale and translation; normals and UVs stay unchanged, and indices receive each cell's vertex offset.

The JSON source uses this schema:

```json
{
  "schemaVersion": 1,
  "columns": 1,
  "rows": 1,
  "cellSize": [2, 2],
  "scale": 2,
  "heightStep": 0.5,
  "origin": [0, 0],
  "templateOffset": [0, 0, 0],
  "templates": [{
    "positions": [[0, 0, 0], [1, 0, 0], [0, 0, 1]],
    "normals": [[0, 1, 0], [0, 1, 0], [0, 1, 0]],
    "uvs": [[0, 0], [1, 0], [0, 1]],
    "indices": [0, 1, 2]
  }]
}
```

Cells run in row-major order along X then Z. Each cell has five hexadecimal characters: three for its template index and two for its height. Template `fff` skips the cell. Height is `(byte - 128) * heightStep`; `00080` places template zero at height zero. The translation is `[origin.x + column * cellSize.x + templateOffset.x, height + templateOffset.y, origin.z + row * cellSize.z + templateOffset.z]`.

Sources allow 1–32 rows/columns, 1–4,095 templates, positive finite spacing and uniform scale, finite channels, unit normals, and valid triangle indices. Input files are limited to 64 MiB and one million template vertices; composed meshes are limited to two million vertices and twelve million indices. Invalid references or geometry return an asset-load error. An all-skipped grid yields an empty mesh.

The runtime caches the source by file timestamp/length, reloads edited sources, and releases unused composed placements with the existing dynamic-mesh cache. CLI packaging includes the referenced `.mpatch` as a model dependency. Runtime package validation parses and composes its cell references. `gltf_bounds` supports inspecting these references with `--positions --normals --uvs`, including streaming input.

Composition preserves authored geometry; it does not weld edges, infer adjacency rules, generate collision/navigation, or combine materials. Those behaviors belong to the consuming terrain system.

# Warcraft model format and animation references

Author: MiYu. Native Rust reader and sampler: `crates/mengine-assets/src/mdx/`.
The host consumer is `crates/mengine-editor-host/src/warcraft_model.rs`.

- [Darithos/W3ModelViewer](https://github.com/Darithos/W3ModelViewer), pinned at `4fe46a0772520fc7b55078bf32cda1237d1b5f2e`: `MdxReader.cs`, `MdxAnimator.cs`, `MdxModel.cs` and replaceable texture definitions. The native implementation follows the classic record layouts, source track interpolation, pivot transforms and matrix groups. Copyright and permission are retained in `LICENSE-W3ModelViewer.txt`.
- [flowtsohg/mdx-m3-viewer](https://github.com/flowtsohg/mdx-m3-viewer), pinned at `2ff0bc00c6363f425016e23d88c0fb2929d3b3cc`: `src/parsers/mdlx/{genericobject,eventobject,collisionshape}.ts` confirm that event and collision records follow a bare generic node. Copyright and permission are retained in `LICENSE-mdx-m3-viewer.txt`.

No upstream executable, .NET runtime, JavaScript viewer or game model is bundled for native loading. The independent .NET sampler remains a development reference under the existing offline import tooling; it is not invoked by the native reader or host consumer. Original MDX and BLP resources remain in the user-provided game/map archives.

To update the references, pin the new Git commit, retain its license, compare the relevant record and sampling semantics, update `source-info.json` hashes, then run the targeted native fixtures and compare a small real source model with independent source poses. Keep original model captures and reference JSON under `tmp/docs-artifacts/`; do not commit them. Version800 is currently implemented. Reforged layouts, MDL text, effects playback, special inheritance, exact additional blend modes and the full map session remain separate implementation work.

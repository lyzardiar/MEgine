<!-- Author: MiYu -->

# Asset provenance

All PNG artwork in `Assets/Art/Generated` was generated specifically for this sample with OpenAI ImageGen on 2026-08-12. No third-party game, character, logo, or commercial asset pack was used.

The character, enemy, and icon sheets were generated on a flat chroma background, converted to transparent PNGs with the OpenAI image-generation skill's `remove_chroma_key.py`, and imported through MEngine Sprite Import metadata.

## 2026-08-12 animation expansion

- `eclipse-warden-sheet.png`: six-frame 3x2 sheet for idle, run, and attack. Prompt requested the existing moonlit heroine, strict frame order, clean readable silhouette, consistent scale, and a flat green chroma background.
- `enemies-animated-atlas.png`: sixteen-frame 4x4 sheet. Rows are shadow bat, moon knight, astral slime, and rift hound; columns are chronological animation frames on a flat green chroma background.
- `skills-v2-atlas.png`: four 2x2 skill icons for chain lightning, meteor shower, double crescent boomerang, and frost pulse on a flat green chroma background.
- `eclipse-warden-aligned.png` and `enemies-aligned-atlas.png`: deterministic derivatives of the generated sheets. Frames are re-cropped around visible pixels and placed on a shared visual center/baseline; no third-party artwork was added.

## Effekseer effects

`Assets/Effects` is copied from Effekseer's official `EffectMaterials` sample collection at commit `dd26a0856864b2d4af9a68ab06beb52517cebb00`. The effects are distributed under CC0 1.0. This sample composes those verified `.efkefc` files into its data-driven skills and does not claim the binary effects as original artwork.

`Assets/Fonts/NotoSansSC.ttf` is Noto Sans Simplified Chinese from the official Google Fonts repository. It is distributed under the SIL Open Font License 1.1; the unmodified license is included at `Assets/Fonts/OFL.txt`.

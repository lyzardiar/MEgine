"""Import the official PaletteSwap layout, palettes and rule outputs (PyYAML/Pillow)."""
import json
import math
from pathlib import Path
import random
import shutil
import sys

from unity_tile_source import COMMIT, UnityTiles, documents, gamma_scene, linear_color, write_json


def main():
    output = Path(__file__).resolve().parents[1] / "samples/unity-palette-swap"
    source = UnityTiles(sys.argv[1], output)
    relative = "Assets/Tilemap/PaletteSwap/PaletteSwap.unity"
    docs = documents(source.source / relative)
    tilemap = next(doc["Tilemap"] for doc in docs.values() if "Tilemap" in doc)
    palettes = []
    for name in "ABC":
        prefab = documents(source.source / f"Assets/Tilemap/PaletteSwap/Tile Palettes/Swap Palette {name}.prefab")
        tiles = next(doc["Tilemap"] for doc in prefab.values() if "Tilemap" in doc)
        palettes.append({cell["first"]["x"]: tiles["m_TileAssetArray"][cell["second"]["m_TileIndex"]]["m_Data"]["guid"] for cell in tiles["m_Tiles"]})
    slots = {guid: position for position, guid in palettes[1].items()}
    cells = [dict(x=cell["first"]["x"], y=cell["first"]["y"], slot=slots[tilemap["m_TileAssetArray"][cell["second"]["m_TileIndex"]]["m_Data"]["guid"]]) for cell in tilemap["m_Tiles"]]
    occupied = {(cell["x"], cell["y"]): cell["slot"] for cell in cells}

    def resolve(guid, cell):
        tile = source.asset(guid)
        same = lambda x, y: occupied.get((cell["x"] + x, cell["y"] + y)) == cell["slot"]
        rotation, frames, fps = 0, [], 0
        if "m_TilingRules" in tile:
            image = tile["m_DefaultSprite"]
            for rule in tile["m_TilingRules"]:
                packed = bytes.fromhex(rule["m_Neighbors"])
                neighbors = [int.from_bytes(packed[i:i + 4], "little") for i in range(0, len(packed), 4)]
                matched = False
                for turns in range(4 if rule["m_RuleTransform"] == 1 else 1):
                    matches = []
                    for condition, position in zip(neighbors, rule["m_NeighborPositions"]):
                        x, y = position["x"], position["y"]
                        for _ in range(turns):
                            x, y = y, -x
                        matches.append(condition == 0 or (same(x, y) if condition == 1 else not same(x, y)))
                    if all(matches):
                        image, rotation, matched = rule["m_Sprites"][0], -turns * math.pi / 2, True
                        if rule["m_Output"] == 2:
                            frames = [source.sprite(value) for value in rule["m_Sprites"]]
                            fps = rule["m_AnimationSpeed"]
                        break
                if matched:
                    break
        elif "Sprites" in tile:
            weighted = tile["Sprites"]
            # Stable per-cell seed; Unity's random generator sequence is not portable.
            rng = random.Random(f"{cell['x']},{cell['y']}")
            image = rng.choices([item["Sprite"] for item in weighted], weights=[item["Weight"] for item in weighted])[0]
        elif "m_Sprites" in tile:
            image, rotation = terrain(tile, same)
        else:
            image = tile["m_Sprite"]
        color = tile.get("m_Color", dict(r=1, g=1, b=1, a=1))
        return dict(sprite=source.sprite(image), color=[color[key] for key in "rgba"], rotation=[0, 0, math.sin(rotation / 2), math.cos(rotation / 2)], frames=frames, fps=fps)

    visuals = [[resolve(palette[cell["slot"]], cell) for cell in cells] for palette in palettes]
    # Keep the authored initial palette's exact random selections and transforms.
    for visual, cell in zip(visuals[1], tilemap["m_Tiles"]):
        data = cell["second"]
        visual["sprite"] = source.sprite(tilemap["m_TileSpriteArray"][data["m_TileSpriteIndex"]]["m_Data"])
        matrix = tilemap["m_TileMatrixArray"][data["m_TileMatrixIndex"]]["m_Data"]
        angle = math.atan2(matrix["e10"], matrix["e00"])
        visual["rotation"] = [0, 0, math.sin(angle / 2), math.cos(angle / 2)]
    entities = [dict(entity=1, name="Main Camera", components=dict(Transform=dict(position=[0, 0, 10], rotation=[0, 0, 0, 1], scale=[1, 1, 1]), Camera2D=dict(size=5)))]
    for cell, visual in zip(cells, visuals[1]):
        cell["name"] = f"Tile {cell['x']} {cell['y']}"
        entities.append(dict(entity=len(entities) + 1, name=cell["name"], components=dict(Transform=dict(position=[cell["x"] + 0.5, cell["y"] + 0.5, 0], rotation=visual["rotation"], scale=[1, 1, 1]), SpriteRenderer=dict(sprite=visual["sprite"], color=visual["color"], size=[1, 1]))))
    canvas = len(entities) + 1
    entities.append(dict(entity=canvas, name="Controls", components=dict(Canvas={}, CanvasScaler=dict(ui_scale_mode="ScaleWithScreenSize", reference_resolution=[960, 540]), RectTransform=dict(anchor_min=[0, 0], anchor_max=[1, 1], size_delta=[0, 0]))))
    entities.append(dict(entity=canvas + 1, parent=canvas, name="Palette Controls", components=dict(RectTransform=dict(anchor_min=[0, 0], anchor_max=[0, 0], pivot=[0, 0], anchored_position=[16, 40], size_delta=[500, 80]), Text=dict(text="Palette B\n1 / Left: previous    2 / Right: next\nSpace: random    R: reset", font="Assets/Fonts/Roboto-Regular.ttf", font_size=18, alignment="Left", vertical_align="Top", raycast_target=False))))
    data = dict(cells=cells, palettes=visuals)
    world = gamma_scene(dict(entities=entities, clear_color=[0.19215687, 0.3019608, 0.4745098, 1]))
    for palette in visuals:
        for visual in palette:
            visual["color"] = linear_color(visual["color"])
    (output / "Assets/Scripts/Data.ts").write_text("/** Converted from Unity Technologies 2d-techdemos (MIT). */\nconst paletteData = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
    write_json(output / "Assets/Scenes/Main.mscene", dict(version=3, name="Palette Swap", world=world))
    write_json(output / "project.json", dict(name="Unity Palette Swap", version=1, language="typescript", mainScene="Assets/Scenes/Main.mscene", buildScenes=["Assets/Scenes/Main.mscene"], startupScript="Assets/Scripts/Main.ts", assetMode="all"))
    shutil.copyfile(output.parent / "types/engine.d.ts", output / "Assets/Scripts/mengine.d.ts")
    shutil.copyfile(source.source / "LICENSE.md", output / "UNITY-LICENSE.md")
    write_json(output / "SOURCE.json", dict(repository="https://github.com/Unity-Technologies/2d-techdemos", commit=COMMIT, scene=relative, license="MIT", adaptations=["Unity Gamma numeric colors are decoded to linear and ACES is disabled; source textures retain sRGB sampling.", "26 editable Sprite entities preserve the authored layout and initial palette B.", "Palette positions map terrain, weighted random, brick, ladder and animated ocean tiles.", "Rule and terrain outputs are resolved during import for the fixed source layout; ocean retains source animation speed.", "Weighted selections outside the authored initial palette use a deterministic per-cell seed instead of Unity's random sequence.", "Original 1/2/Space controls are retained, with Left/Right aliases and R to reset; a Canvas text label replaces UI Toolkit."]))
    print(f"Imported {len(cells)} cells, 3 palettes and {len(source.imported)} sprite sheets")


def terrain(tile, same):
    # Eight-neighbor terrain mask, N/NE/E/SE/S/SW/W/NW.
    mask = sum(1 << bit for bit, (x, y) in enumerate([(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]) if same(x, y))
    for diagonal, sides in [(2, 5), (8, 20), (32, 80), (128, 65)]:
        if mask & sides != sides:
            mask &= ~diagonal
    # Filled by the terrain tile's canonical masks and clockwise rotations.
    canonical = [0, 1, 5, 7, 17, 21, 23, 29, 31, 85, 87, 95, 119, 127, 255]
    for index, pattern in enumerate(canonical):
        for turns in range(4):
            rotated = ((pattern << (2 * turns)) | (pattern >> (8 - 2 * turns))) & 255
            if rotated == mask:
                return tile["m_Sprites"][index], -turns * math.pi / 2
    raise ValueError(f"Unsupported terrain mask {mask}")


if __name__ == "__main__":
    main()

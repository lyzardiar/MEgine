"""Import official tile demos with a playable brush (PyYAML/Pillow)."""
import json
import math
from pathlib import Path
import shutil
import sys

from unity_tile_source import COMMIT, UnityTiles, documents, gamma_scene, linear_color, write_json

DEMOS = {"Random Tile": "random", "Weighted Random Tile": "weighted", "Terrain Tile": "terrain", "Pipeline Tile": "pipeline", "Auto Tile": "auto", "Custom Rule Tile": "custom", "Rule Override Tile": "override"}


def main():
    repo = Path(__file__).resolve().parents[1]
    for title, kind in DEMOS.items():
        slug = "unity-" + title.lower().replace(" ", "-")
        output = repo / "samples" / slug
        source = UnityTiles(sys.argv[1], output)
        category = "Rule Tiles" if kind in ("custom", "override") else "Tiles"
        relative = f"Assets/Tilemap/{category}/{title}/{title}.unity"
        docs = documents(source.source / relative)
        tilemap = next(doc["Tilemap"] for doc in docs.values() if "Tilemap" in doc)
        camera = next(doc["Camera"] for doc in docs.values() if "Camera" in doc)
        camera_transform = next(doc["Transform"] for doc in docs.values() if "Transform" in doc and doc["Transform"]["m_GameObject"] == camera["m_GameObject"])
        camera_position = [camera_transform["m_LocalPosition"][key] for key in "xy"]
        tiles, tile_indices = [], {}
        for source_index, entry in enumerate(tilemap["m_TileAssetArray"]):
            reference = entry["m_Data"]
            if reference["fileID"] == 0:
                continue
            tile_indices[source_index] = len(tiles)
            tile = source.asset(reference["guid"], reference["fileID"])
            tile_name = tile["m_Name"]
            if "m_InstanceTile" in tile:
                tile = source.asset(reference["guid"], tile["m_InstanceTile"]["fileID"])
            lookup, rules, family, group, default_sprite = {}, [], "", 0, ""
            if kind == "auto":
                assert tile["m_MaskType"] == 1 and not tile["m_Random"]
                dictionary = tile["m_AutoTileDictionary"]
                packed = bytes.fromhex(dictionary["keyData"])
                masks = [int.from_bytes(packed[i:i + 4], "little") for i in range(0, len(packed), 4)]
                assert len(masks) == len(dictionary["valueData"])
                weighted = []
                for mask, entry in zip(masks, dictionary["valueData"]):
                    assert len(entry["spriteList"]) == 1
                    reference = entry["spriteList"][0]
                    weighted.append(dict(Sprite=reference, Weight=1))
                    lookup[str(mask)] = source.sprite(reference)
            elif kind in ("custom", "override"):
                default_sprite = source.sprite(tile.get("m_DefaultSprite", tile.get("m_Sprite")))
                family = "sibling" if "sibingGroup" in tile else "terrain" if "desert" in tile else "type" if "m_TilingRules" in tile else ""
                group = tile.get("sibingGroup", tile.get("desert", 0))
                weighted = [dict(Sprite=tile.get("m_DefaultSprite", tile.get("m_Sprite")), Weight=1)]
                for rule in tile.get("m_TilingRules", []):
                    assert rule["m_Output"] == 0 and rule["m_RuleTransform"] in (0, 1)
                    packed = bytes.fromhex(rule["m_Neighbors"] or "")
                    neighbors = [int.from_bytes(packed[i:i + 4], "little") for i in range(0, len(packed), 4)]
                    rules.append(dict(neighbors=neighbors, positions=[[p["x"], p["y"]] for p in rule["m_NeighborPositions"] or []], rotate=rule["m_RuleTransform"] == 1, sprite=source.sprite(rule["m_Sprites"][0])))
                    weighted.append(dict(Sprite=rule["m_Sprites"][0], Weight=1))
            else:
                weighted = tile.get("Sprites") or [dict(Sprite=sprite, Weight=1) for sprite in tile["m_Sprites"]]
            color = tile.get("m_Color", dict(r=1, g=1, b=1, a=1))
            tiles.append(dict(name=tile_name, sprites=[source.sprite(item["Sprite"]) for item in weighted], weights=[item["Weight"] for item in weighted], color=[color[key] for key in "rgba"], lookup=lookup, defaultSprite=source.sprite(tile["m_DefaultSprite"]) if kind == "auto" else default_sprite, rules=rules, family=family, group=group))
        entities = [dict(entity=1, name="Main Camera", components=dict(Transform=dict(position=camera_position + [10], rotation=[0, 0, 0, 1], scale=[1, 1, 1]), Camera2D=dict(size=camera["orthographic size"])))]
        cells = []
        for cell in tilemap["m_Tiles"]:
            x, y = cell["first"]["x"], cell["first"]["y"]
            data = cell["second"]
            sprite = source.sprite(tilemap["m_TileSpriteArray"][data["m_TileSpriteIndex"]]["m_Data"])
            matrix = tilemap["m_TileMatrixArray"][data["m_TileMatrixIndex"]]["m_Data"]
            angle = math.atan2(matrix["e10"], matrix["e00"])
            rotation = [0, 0, math.sin(angle / 2), math.cos(angle / 2)]
            cells.append(dict(x=x, y=y, tile=tile_indices[data["m_TileIndex"]], sprite=sprite, rotation=rotation))
            color = tilemap["m_TileColorArray"][data["m_TileColorIndex"]]["m_Data"]
            rgba = [color[key] * tilemap["m_Color"][key] for key in "rgba"]
            entities.append(dict(entity=len(entities) + 1, name=f"Tile {x} {y}", components=dict(Transform=dict(position=[x + 0.5, y + 0.5, 0], rotation=rotation, scale=[1, 1, 1]), SpriteRenderer=dict(sprite=sprite, color=rgba, size=[1, 1]))))
        canvas = len(entities) + 1
        entities.append(dict(entity=canvas, name="Controls", components=dict(Canvas={}, CanvasScaler=dict(ui_scale_mode="ScaleWithScreenSize", reference_resolution=[960, 540]), RectTransform=dict(anchor_min=[0, 0], anchor_max=[1, 1], size_delta=[0, 0]))))
        choices = ' / '.join(str(i + 1) for i in range(len(tiles)))
        controls = f"{title}\n{tiles[0]['name']}\n\nLeft mouse: paint\nRight mouse: erase\n" + (f"{choices}: choose tile\n" if len(tiles) > 1 else "") + "Z: undo    R: reset\nH: show / hide controls"
        entities.append(dict(entity=canvas + 1, parent=canvas, name="Brush Controls", components=dict(RectTransform=dict(anchor_min=[0, 0], anchor_max=[0, 0], pivot=[0, 0], anchored_position=[16, 40], size_delta=[225, 230]), Text=dict(text=controls, font="Assets/Fonts/Roboto-Regular.ttf", font_size=18, alignment="Left", vertical_align="Top", raycast_target=False))))
        data = dict(title=title, kind=kind, cameraSize=camera["orthographic size"], cameraPosition=camera_position, cells=cells, tiles=tiles)
        for tile in tiles:
            tile["color"] = linear_color(tile["color"])
        (output / "Assets/Scripts/Data.ts").write_text("/** Official MIT tile assets and authored cells. */\nconst tileData = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
        write_json(output / "Assets/Scenes/Main.mscene", dict(version=3, name=title, world=gamma_scene(dict(entities=entities, clear_color=[camera["m_BackGroundColor"][key] for key in "rgb"] + [1]))))
        write_json(output / "project.json", dict(name="Unity " + title, version=1, language="typescript", mainScene="Assets/Scenes/Main.mscene", buildScenes=["Assets/Scenes/Main.mscene"], startupScript="Assets/Scripts/Main.ts", assetMode="all"))
        shutil.copyfile(repo / "scripts/templates/unity-tile-painter.ts", output / "Assets/Scripts/Main.ts")
        shutil.copyfile(repo / "samples/types/engine.d.ts", output / "Assets/Scripts/mengine.d.ts")
        shutil.copyfile(source.source / "LICENSE.md", output / "UNITY-LICENSE.md")
        (output / "Assets/Fonts").mkdir(exist_ok=True)
        for filename in ["Roboto-Regular.ttf", "LICENSE.txt"]:
            shutil.copyfile(repo / "samples/unity-palette-swap/Assets/Fonts" / filename, output / "Assets/Fonts" / filename)
        write_json(output / "SOURCE.json", dict(repository="https://github.com/Unity-Technologies/2d-techdemos", commit=COMMIT, scene=relative, license="MIT", sourceCells=len(cells), adaptations=["Unity Gamma numeric colors are decoded to linear and ACES is disabled; source textures retain sRGB sampling.", "Independent editable Sprite entities preserve the authored tile layout, selected sprites, rotations and colors.", "A runtime brush demonstrates painting, erasing, tile selection, 64-cell undo history and reset; the source scene has no runtime input.", "Terrain, pipe and Auto Tile neighbors update when the brush edits a cell. Custom rules match terrain groups or tile classes and rotate the source outputs. Rule Override Tile resolves serialized instances by fileID and connects sibling groups across base and override tiles. Random tiles retain source sprite lists and weights, with a deterministic coordinate hash for new cells.", "Runtime brush changes are temporary; R or Stop restores the source scene. Roboto controls use Apache 2.0."]))
        readme = f"""# {title}

来自 Unity Technologies [2d-techdemos](https://github.com/Unity-Technologies/2d-techdemos/tree/{COMMIT}/Assets/Tilemap/{category.replace(' ', '%20')}/{title.replace(' ', '%20')})，保留官方 {len(cells)} 个单元格、纹理、切片、颜色、方向和初始布局。

在 MEngine 打开本目录并播放。左键绘制，右键擦除，数字键 {choices} 选择图块，Z 撤销（最多 64 个单元格操作），R 恢复官方初始布局，H 显示/隐藏提示。地形、管道和 Auto Tile 会根据同类型邻居更新连接；Custom Rule Tile 根据地形分组或自定义类型匹配邻居，并保留规则旋转。Rule Override Tile 按文件 ID 展开覆盖实例，同组的原始/覆盖图块相互连接。随机图块按坐标固定，保留源 Sprite 列表和权重。新增随机单元格使用 MEngine 的确定性哈希，不依赖 Unity 随机数实现。原场景为图块功能展示，没有运行时输入；这里增加可操作画笔，运行时修改不写回场景。

场景和贴图 MIT 许可证见 `UNITY-LICENSE.md`；Roboto 字体来源和 Apache 2.0 许可证与 `unity-palette-swap` 相同，许可证随项目放在 `Assets/Fonts/LICENSE.txt`。完整来源见 `SOURCE.json`。

重新导入：`python scripts/import-unity-tiles.py <2d-techdemos checkout>`。原生验收入口 `scripts/qa-unity-tiles.mjs`。
"""
        (output / "README.md").write_text(readme, encoding="utf-8")
        print(f"Imported {slug}: {len(cells)} cells, {len(tiles)} tile assets")


if __name__ == "__main__":
    main()

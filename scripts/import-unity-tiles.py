"""Import four official tile demos with a playable brush (PyYAML/Pillow)."""
import json
import math
from pathlib import Path
import shutil
import sys

from unity_tile_source import COMMIT, UnityTiles, documents, gamma_scene, linear_color, write_json

DEMOS = {"Random Tile": "random", "Weighted Random Tile": "weighted", "Terrain Tile": "terrain", "Pipeline Tile": "pipeline"}


def main():
    repo = Path(__file__).resolve().parents[1]
    for title, kind in DEMOS.items():
        slug = "unity-" + title.lower().replace(" ", "-")
        output = repo / "samples" / slug
        source = UnityTiles(sys.argv[1], output)
        relative = f"Assets/Tilemap/Tiles/{title}/{title}.unity"
        docs = documents(source.source / relative)
        tilemap = next(doc["Tilemap"] for doc in docs.values() if "Tilemap" in doc)
        camera = next(doc["Camera"] for doc in docs.values() if "Camera" in doc)
        camera_transform = next(doc["Transform"] for doc in docs.values() if "Transform" in doc and doc["Transform"]["m_GameObject"] == camera["m_GameObject"])
        camera_position = [camera_transform["m_LocalPosition"][key] for key in "xy"]
        tiles = []
        for entry in tilemap["m_TileAssetArray"]:
            tile = source.asset(entry["m_Data"]["guid"])
            weighted = tile.get("Sprites") or [dict(Sprite=sprite, Weight=1) for sprite in tile["m_Sprites"]]
            color = tile.get("m_Color", dict(r=1, g=1, b=1, a=1))
            tiles.append(dict(name=tile["m_Name"], sprites=[source.sprite(item["Sprite"]) for item in weighted], weights=[item["Weight"] for item in weighted], color=[color[key] for key in "rgba"]))
        entities = [dict(entity=1, name="Main Camera", components=dict(Transform=dict(position=camera_position + [10], rotation=[0, 0, 0, 1], scale=[1, 1, 1]), Camera2D=dict(size=camera["orthographic size"])))]
        cells = []
        for cell in tilemap["m_Tiles"]:
            x, y = cell["first"]["x"], cell["first"]["y"]
            data = cell["second"]
            sprite = source.sprite(tilemap["m_TileSpriteArray"][data["m_TileSpriteIndex"]]["m_Data"])
            matrix = tilemap["m_TileMatrixArray"][data["m_TileMatrixIndex"]]["m_Data"]
            angle = math.atan2(matrix["e10"], matrix["e00"])
            rotation = [0, 0, math.sin(angle / 2), math.cos(angle / 2)]
            cells.append(dict(x=x, y=y, tile=data["m_TileIndex"], sprite=sprite, rotation=rotation))
            color = tilemap["m_TileColorArray"][data["m_TileColorIndex"]]["m_Data"]
            rgba = [color[key] * tilemap["m_Color"][key] for key in "rgba"]
            entities.append(dict(entity=len(entities) + 1, name=f"Tile {x} {y}", components=dict(Transform=dict(position=[x + 0.5, y + 0.5, 0], rotation=rotation, scale=[1, 1, 1]), SpriteRenderer=dict(sprite=sprite, color=rgba, size=[1, 1]))))
        canvas = len(entities) + 1
        entities.append(dict(entity=canvas, name="Controls", components=dict(Canvas={}, CanvasScaler=dict(ui_scale_mode="ScaleWithScreenSize", reference_resolution=[960, 540]), RectTransform=dict(anchor_min=[0, 0], anchor_max=[1, 1], size_delta=[0, 0]))))
        controls = f"{title}\n{tiles[0]['name']}\n\nLeft mouse: paint\nRight mouse: erase\n" + ("1 / 2: choose tile\n" if len(tiles) > 1 else "") + "Z: undo    R: reset"
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
        write_json(output / "SOURCE.json", dict(repository="https://github.com/Unity-Technologies/2d-techdemos", commit=COMMIT, scene=relative, license="MIT", sourceCells=len(cells), adaptations=["Unity Gamma numeric colors are decoded to linear and ACES is disabled; source textures retain sRGB sampling.", "Independent editable Sprite entities preserve the authored tile layout, selected sprites, rotations and colors.", "A runtime brush demonstrates painting, erasing, tile selection, 64-cell undo history and reset; the source scene has no runtime input.", "Terrain and pipe neighbors update when the brush edits a cell. Random tiles retain source sprite lists and weights, with a deterministic coordinate hash for new cells.", "Runtime brush changes are temporary; R or Stop restores the source scene. Roboto controls use Apache 2.0."]))
        readme = f"""# {title}

来自 Unity Technologies [2d-techdemos](https://github.com/Unity-Technologies/2d-techdemos/tree/{COMMIT}/Assets/Tilemap/Tiles/{title.replace(' ', '%20')})，保留官方 {len(cells)} 个单元格、纹理、切片、颜色、方向和初始布局。

在 MEngine 打开本目录并播放。左键绘制，右键擦除，数字键 1/2 选择图块，Z 撤销（最多 64 个单元格操作），R 恢复官方初始布局。地形/管道会根据同类型邻居更新连接；随机图块按坐标固定，保留源 Sprite 列表和权重。新增随机单元格使用 MEngine 的确定性哈希，不依赖 Unity 随机数实现。原场景为图块功能展示，没有运行时输入；这里增加可操作画笔，运行时修改不写回场景。

场景和贴图 MIT 许可证见 `UNITY-LICENSE.md`；Roboto 字体来源和 Apache 2.0 许可证与 `unity-palette-swap` 相同，许可证随项目放在 `Assets/Fonts/LICENSE.txt`。完整来源见 `SOURCE.json`。

重新导入：`python scripts/import-unity-tiles.py <2d-techdemos checkout>`。原生验收入口 `scripts/qa-unity-tiles.mjs`。
"""
        (output / "README.md").write_text(readme, encoding="utf-8")
        print(f"Imported {slug}: {len(cells)} cells, {len(tiles)} tile assets")


if __name__ == "__main__":
    main()

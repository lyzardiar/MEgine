"""Import the official Hexagonal coast and its ordered HexagonalRuleTile rules."""
import json
from pathlib import Path
import shutil
import sys

from unity_tile_source import COMMIT, UnityTiles, documents, gamma_scene, write_json


def main():
    repo = Path(__file__).resolve().parents[1]
    output = repo / "samples/unity-hexagonal"
    source = UnityTiles(sys.argv[1], output)
    relative = "Assets/Tilemap/Hexagonal/Scenes/Hexagonal.unity"
    docs = documents(source.source / relative)
    grid = next(doc["Grid"] for doc in docs.values() if "Grid" in doc)
    assert grid["m_CellLayout"] == 1 and grid["m_CellSwizzle"] == 0
    size = [grid["m_CellSize"][k] for k in "xy"]
    layers, rules = {}, []
    entities = []
    for tilemap in (doc["Tilemap"] for doc in docs.values() if "Tilemap" in doc):
        name = docs[tilemap["m_GameObject"]["fileID"]]["GameObject"]["m_Name"]
        renderer = next(doc["TilemapRenderer"] for doc in docs.values() if "TilemapRenderer" in doc and doc["TilemapRenderer"]["m_GameObject"] == tilemap["m_GameObject"])
        if name == "Land":
            tile = source.asset(tilemap["m_TileAssetArray"][0]["m_Data"]["guid"])
            assert tile["m_FlatTop"] == 0
            for rule in tile["m_TilingRules"]:
                packed = bytes.fromhex(rule["m_Neighbors"] or "")
                neighbors = [int.from_bytes(packed[i:i + 4], "little") for i in range(0, len(packed), 4)]
                assert all(n == 1 for n in neighbors) and rule["m_RuleTransform"] in (0, 2) and rule["m_Output"] == 0
                rules.append(dict(positions=[[p["x"], p["y"]] for p in rule["m_NeighborPositions"][:len(neighbors)]], mirror=rule["m_RuleTransform"] == 2, sprite=source.sprite(rule["m_Sprites"][0])))
            default_sprite = source.sprite(tile["m_DefaultSprite"])
        cells = []
        for cell in tilemap["m_Tiles"]:
            x, y = cell["first"]["x"], cell["first"]["y"]
            data = cell["second"]
            sprite = source.sprite(tilemap["m_TileSpriteArray"][data["m_TileSpriteIndex"]]["m_Data"])
            matrix = tilemap["m_TileMatrixArray"][data["m_TileMatrixIndex"]]["m_Data"]
            assert matrix["e01"] == matrix["e10"] == 0 and matrix["e11"] == 1
            flip = matrix["e00"] < 0
            cells.append(dict(x=x, y=y, sprite=sprite, flip=flip))
            entities.append(dict(entity=len(entities) + 2, name=f"{name} {x} {y}", components=dict(Transform=dict(position=[(x + .5 * (y % 2)) * size[0], y * .75 * size[1], 0]), SpriteRenderer=dict(sprite=sprite, size=[1, 68 / 60], flip_x=flip, sorting_order=renderer["m_SortingOrder"] * 10000 + y * 32 + x))))
        layers[name] = cells
    # Unity's authored camera is at the grid origin; frame the entire positive-coordinate map.
    bounds = [[min(e["components"]["Transform"]["position"][axis] - [1, 68 / 60][axis] / 2 for e in entities), max(e["components"]["Transform"]["position"][axis] + [1, 68 / 60][axis] / 2 for e in entities)] for axis in range(2)]
    center = [(lo + hi) / 2 for lo, hi in bounds]
    camera_size = max((bounds[1][1] - bounds[1][0]) / 2, (bounds[0][1] - bounds[0][0]) / 2 / (16 / 9)) * 1.06
    entities.insert(0, dict(entity=1, name="Main Camera", components=dict(Transform=dict(position=center + [10]), Camera2D=dict(size=camera_size))))
    canvas = len(entities) + 1
    entities.append(dict(entity=canvas, name="Controls", components=dict(Canvas={}, CanvasScaler=dict(ui_scale_mode="ScaleWithScreenSize", reference_resolution=[960, 540]), RectTransform=dict(anchor_min=[0, 0], anchor_max=[1, 1], size_delta=[0, 0]))))
    entities.append(dict(entity=canvas + 1, parent=canvas, name="Brush Controls", components=dict(RectTransform=dict(anchor_min=[0, 0], anchor_max=[0, 0], pivot=[0, 0], anchored_position=[16, 40], size_delta=[260, 140]), Text=dict(text="Hexagonal\nLeft mouse: add land\nRight mouse: remove land\nZ: undo    R: reset\nH: show / hide controls", font="Assets/Fonts/Roboto-Regular.ttf", font_size=18, alignment="Left", vertical_align="Top", raycast_target=False))))
    data = dict(size=size, cameraPosition=center, cameraSize=camera_size, land=layers["Land"], ocean=layers["Ocean"], rules=rules, defaultSprite=default_sprite)
    (output / "Assets/Scripts/Data.ts").write_text("/** Official hex coast cells and rule outputs, MIT. */\nconst hexData = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
    write_json(output / "Assets/Scenes/Main.mscene", dict(version=3, name="Hexagonal", world=gamma_scene(dict(entities=entities, clear_color=[0.19215687, 0.3019608, 0.4745098, 1]))))
    write_json(output / "project.json", dict(name="Unity Hexagonal", version=1, language="typescript", mainScene="Assets/Scenes/Main.mscene", buildScenes=["Assets/Scenes/Main.mscene"], startupScript="Assets/Scripts/Main.ts", assetMode="all"))
    shutil.copyfile(repo / "scripts/templates/unity-hexagonal.ts", output / "Assets/Scripts/Main.ts")
    shutil.copyfile(repo / "samples/types/engine.d.ts", output / "Assets/Scripts/mengine.d.ts")
    shutil.copyfile(source.source / "LICENSE.md", output / "UNITY-LICENSE.md")
    (output / "Assets/Fonts").mkdir(exist_ok=True)
    for filename in ("Roboto-Regular.ttf", "LICENSE.txt"):
        shutil.copyfile(repo / "samples/unity-palette-swap/Assets/Fonts" / filename, output / "Assets/Fonts" / filename)
    write_json(output / "SOURCE.json", dict(repository="https://github.com/Unity-Technologies/2d-techdemos", commit=COMMIT, scene=relative, license="MIT", sourceCells=496, adaptations=["400 Ocean and 96 Land cells retain original sprites, horizontal mirrors, dimensions and layer order. Explicit BottomLeft cell order keeps overlapping transparent edges deterministic after reload.", "38 ordered Land rules use the point-top odd-row offset and MirrorX neighbor mapping; runtime edits refresh connected coasts.", "Camera frames the complete map instead of the source origin-centered camera. Hex coordinates were checked with Unity 2022.3.47f1c1 Grid.CellToLocal in an isolated probe project.", "Left paints Land on existing Ocean cells, right removes Land, Z undoes 64 edits, R resets and H hides controls; the source is an editor-only tile composition.", "Gamma numeric colors are decoded and ACES is disabled."]))
    (output / "README.md").write_text(f"""# Hexagonal

来自 Unity 官方 [2d-techdemos](https://github.com/Unity-Technologies/2d-techdemos/tree/{COMMIT}/Assets/Tilemap/Hexagonal)（MIT）。保留 400 个海洋格、96 个陆地格及 38 条海岸规则，含 28 个水平镜像源格。

左键在海洋上添加陆地，右键删除陆地，海岸实时重算；Z 撤销（64 次），R 重开，H 显示/隐藏提示。原始场景为编辑器图块展示，此处增加运行时画笔。相机自动框选全图，网格大小、奇偶行偏移、Sprite 尺寸和层级顺序保持源数据。

坐标公式已用隔离 Unity 2022.3.47f1c1 的 Grid.CellToLocal 实测核对。来源和适配见 `SOURCE.json`，许可证见 `UNITY-LICENSE.md` 和 `Assets/Fonts/LICENSE.txt`。导入：`python scripts/import-unity-hexagonal.py <2d-techdemos checkout>`。
""", encoding="utf-8")
    print(f"Imported Hexagonal: {len(layers['Ocean'])} Ocean, {len(layers['Land'])} Land, {len(rules)} rules")


if __name__ == "__main__":
    main()

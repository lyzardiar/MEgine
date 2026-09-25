"""Import the two official tint brush scenes and their editable color data."""
import json
from pathlib import Path
import shutil
import sys

from unity_tile_source import COMMIT, UnityTiles, documents, gamma_scene, write_json


def main():
    repo = Path(__file__).resolve().parents[1]
    for smooth in (False, True):
        title = "Tint Brush Smooth" if smooth else "Tint Brush"
        slug = title.lower().replace(" ", "-")
        output = repo / "samples" / ("unity-" + slug)
        source = UnityTiles(sys.argv[1], output)
        relative = f"Assets/Tilemap/Brushes/{title}/" + ("Tint Brush Smooth.unity" if smooth else "TintBrushExample.unity")
        docs = documents(source.source / relative)
        tilemap = next(doc["Tilemap"] for doc in docs.values() if "Tilemap" in doc)
        camera = next(doc["Camera"] for doc in docs.values() if "Camera" in doc)
        tints, cells = {}, []
        if smooth:
            info = next(doc["MonoBehaviour"] for doc in docs.values() if "m_PositionColorKeys" in doc.get("MonoBehaviour", {}))
            for key, color in zip(info["m_PositionColorKeys"], info["m_PositionColorValues"]):
                assert key["name"] == "Tint"
                tints[f"{key['position']['x']},{key['position']['y']}"] = [color[k] for k in "rgba"]
        entities = [dict(entity=1, name="Main Camera", components=dict(Transform=dict(position=[0, 0, 10]), Camera2D=dict(size=camera["orthographic size"])))]
        for cell in tilemap["m_Tiles"]:
            x, y = cell["first"]["x"], cell["first"]["y"]
            data = cell["second"]
            sprite = source.sprite(tilemap["m_TileSpriteArray"][data["m_TileSpriteIndex"]]["m_Data"])
            color = tilemap["m_TileColorArray"][data["m_TileColorIndex"]]["m_Data"]
            rgba = [color[k] * tilemap["m_Color"][k] for k in "rgba"]
            if not smooth:
                tints[f"{x},{y}"] = rgba
            cells.append(dict(x=x, y=y, sprite=sprite))
            components = dict(Transform=dict(position=[x + .5, y + .5, 0]), SpriteRenderer=dict(sprite=sprite, size=[1, 1], color=rgba))
            if smooth:
                components["SpriteRenderer"]["material"] = "Assets/Materials/Tint.mmat"
                components["MaterialPropertyBlock"] = dict(custom_parameter_names=[f"tint{i}" for i in range(9)], custom_parameter_values=[tints.get(f"{x + dx},{y + dy}", [1, 1, 1, 1]) for dy in range(-1, 2) for dx in range(-1, 2)])
            entities.append(dict(entity=len(entities) + 1, name=f"Tile {x} {y}", components=components))
        canvas = len(entities) + 1
        entities.append(dict(entity=canvas, name="Controls", components=dict(Canvas={}, CanvasScaler=dict(ui_scale_mode="ScaleWithScreenSize", reference_resolution=[960, 540]), RectTransform=dict(anchor_min=[0, 0], anchor_max=[1, 1], size_delta=[0, 0]))))
        controls = title + "\n1/2/3/4/5: color\nLeft: paint    Right: white\nMiddle: pick color\nB: blend 100% / 50% / 0%\nZ: undo    R: reset\nH: show / hide controls"
        entities.append(dict(entity=canvas + 1, parent=canvas, name="Brush Controls", components=dict(RectTransform=dict(anchor_min=[0, 0], anchor_max=[0, 0], pivot=[0, 0], anchored_position=[16, 40], size_delta=[260, 180]), Text=dict(text=controls, font="Assets/Fonts/Roboto-Regular.ttf", font_size=18, alignment="Left", vertical_align="Top", raycast_target=False))))
        data = dict(title=title, smooth=smooth, cameraSize=camera["orthographic size"], cells=cells, tints=tints)
        (output / "Assets/Scripts/Data.ts").write_text("/** Authored Unity tint data in the source Gamma color space. */\nconst tintData = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
        write_json(output / "Assets/Scenes/Main.mscene", dict(version=3, name=title, world=gamma_scene(dict(entities=entities, clear_color=[camera["m_BackGroundColor"][k] for k in "rgb"] + [1]))))
        write_json(output / "project.json", dict(name="Unity " + title, version=1, language="typescript", mainScene="Assets/Scenes/Main.mscene", buildScenes=["Assets/Scenes/Main.mscene"], startupScript="Assets/Scripts/Main.ts", assetMode="all"))
        shutil.copyfile(repo / "scripts/templates/unity-tint-brush.ts", output / "Assets/Scripts/Main.ts")
        shutil.copyfile(repo / "samples/types/engine.d.ts", output / "Assets/Scripts/mengine.d.ts")
        shutil.copyfile(source.source / "LICENSE.md", output / "UNITY-LICENSE.md")
        (output / "Assets/Fonts").mkdir(exist_ok=True)
        for filename in ("Roboto-Regular.ttf", "LICENSE.txt"):
            shutil.copyfile(repo / "samples/unity-palette-swap/Assets/Fonts" / filename, output / "Assets/Fonts" / filename)
        if smooth:
            (output / "Assets/Materials").mkdir(exist_ok=True)
            (output / "Assets/Shaders").mkdir(exist_ok=True)
            shutil.copyfile(repo / "scripts/templates/unity-tint-smooth.mshader", output / "Assets/Shaders/Tint.mshader")
            write_json(output / "Assets/Materials/Tint.mmat", dict(version=10, name="World tint", shader="custom", custom_shader="Assets/Shaders/Tint.mshader", surface="transparent", base_color=[1, 1, 1, 1], wrap_u="clamp", wrap_v="clamp", filter="linear"))
        write_json(output / "SOURCE.json", dict(repository="https://github.com/Unity-Technologies/2d-techdemos", commit=COMMIT, scene=relative, license="MIT", sourceCells=len(cells), tintProperties=len(tints), adaptations=["Original cells, Brick sprite, camera and tint data are retained.", "The editor-only brush is playable with paint, white erase, color pick, blend, undo and reset.", *( ["Smooth tint uses nine neighboring Gamma color samples per sprite and fragment bilinear interpolation, including ARGB32 quantization. This is equivalent to sampling the source 1-texel-per-cell tint map over this fixed rectangular grid."] if smooth else []), "Sprite materials and per-entity MaterialPropertyBlock share the runtime shader and reflection paths. ACES is disabled for source Gamma scenes."]))
        (output / "README.md").write_text(f"""# {title}

来自 Unity 官方 [2d-techdemos](https://github.com/Unity-Technologies/2d-techdemos/tree/{COMMIT}/Assets/Tilemap/Brushes/{title.replace(' ', '%20')})（MIT）。保留 {len(cells)} 个源单元格、Brick 贴图、相机及 {len(tints)} 组颜色。

播放后左键染色、右键还原白色、中键取色；1/2/3/4/5 选择红/绿/蓝/白/橙，B 切换混合强度 100%/50%/0%，Z 撤销（64 次），R 重开，H 显示或隐藏提示。普通 Tint 只修改已有图块；Smooth 修改网格颜色，邻近图块连续过渡。原始画笔属于 Unity Editor，此项目增加运行时操作。

Smooth 将每格周围的九个颜色通过 MaterialPropertyBlock 传入片元 shader，以源 ARGB32 量化、Gamma 混色和双线性插值还原连续 tint map。没有把渐变烘焙到图片。Roboto 字体许可证在 `Assets/Fonts/LICENSE.txt`；场景来源和适配记录见 `SOURCE.json`。

重新导入：`python scripts/import-unity-tint.py <2d-techdemos checkout>`。
""", encoding="utf-8")
        print(f"Imported {slug}: {len(cells)} cells, {len(tints)} tint properties")


if __name__ == "__main__":
    main()

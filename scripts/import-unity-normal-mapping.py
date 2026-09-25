"""Import both official normal-mapping variants with live per-pixel material lighting."""
import json
from pathlib import Path
import shutil
import sys

from unity_tile_source import COMMIT, UnityTiles, documents, gamma_scene, write_json


def main():
    repo = Path(__file__).resolve().parents[1]
    output = repo / "samples/unity-normal-mapping"
    source = UnityTiles(sys.argv[1], output)
    variants, reference_cells = [], None
    for pipeline in ("Built-in", "URP"):
        relative = f"Assets/Tilemap/Normal Mapping ({pipeline})/Scene/normalmapping.unity"
        docs = documents(source.source / relative)
        tilemap = next(doc["Tilemap"] for doc in docs.values() if "Tilemap" in doc)
        camera = next(doc["Camera"] for doc in docs.values() if "Camera" in doc)
        camera_transform = next(doc["Transform"] for doc in docs.values() if "Transform" in doc and doc["Transform"]["m_GameObject"] == camera["m_GameObject"])
        camera_position = [camera_transform["m_LocalPosition"][k] for k in "xy"]
        entities = [dict(entity=1, name="Main Camera", components=dict(Transform=dict(position=camera_position + [10]), Camera2D=dict(size=camera["orthographic size"])))]
        cells = []
        for cell in tilemap["m_Tiles"]:
            x, y = cell["first"]["x"], cell["first"]["y"]
            sprite = source.sprite(tilemap["m_TileSpriteArray"][cell["second"]["m_TileSpriteIndex"]]["m_Data"])
            cells.append(dict(x=x, y=y, sprite=sprite))
            entities.append(dict(entity=len(entities) + 1, name=f"Tile {x} {y}", components=dict(Transform=dict(position=[x + .5, y + .5, 0]), SpriteRenderer=dict(sprite=sprite, size=[1, 1], material="Assets/Materials/Normal.mmat"))))
        if reference_cells is None:
            reference_cells = cells
        assert cells == reference_cells and len(cells) == 16
        lights = {}
        for doc in docs.values():
            light = doc.get("Light") if pipeline == "Built-in" else doc.get("MonoBehaviour")
            if light is None or (pipeline == "URP" and "m_LightType" not in light):
                continue
            name = docs[light["m_GameObject"]["fileID"]]["GameObject"]["m_Name"]
            transform = next(doc["Transform"] for doc in docs.values() if "Transform" in doc and doc["Transform"]["m_GameObject"] == light["m_GameObject"])
            color = light["m_Color"]
            position = [transform["m_LocalPosition"][k] for k in "xyz"]
            radius = light["m_Range"] if pipeline == "Built-in" else light["m_PointLightOuterRadius"]
            if pipeline == "URP":
                assert light["m_UseNormalMap"] == 0 and light["m_PointLightInnerRadius"] == 3 and radius == 7
            lights[name.split()[0].lower()] = dict(position=position + [radius], color=[color[k] for k in "rgb"] + [light["m_Intensity"]])
            entities.append(dict(entity=len(entities) + 1, name=name, components=dict(Transform=dict(position=position))))
        settings = next(doc["RenderSettings"] for doc in docs.values() if "RenderSettings" in doc)
        ambient = [settings["m_AmbientSkyColor"][k] for k in "rgb"] + [1] if pipeline == "Built-in" else [0, 0, 0, 1]
        options = [1, 0, 0, 1] if pipeline == "Built-in" else [0, 1, 3, 1]
        variant = dict(title=pipeline, scene=f"Assets/Scenes/{pipeline}.mscene", lights=lights, options=options, ambient=ambient)
        variants.append(variant)
        names = ["blue_position", "blue_color", "orange_position", "orange_color", "lighting", "ambient"]
        values = [lights["blue"]["position"], lights["blue"]["color"], lights["orange"]["position"], lights["orange"]["color"], options, ambient]
        for entity in entities:
            if "SpriteRenderer" in entity["components"]:
                entity["components"]["MaterialPropertyBlock"] = dict(custom_parameter_names=names, custom_parameter_values=values)
        canvas = len(entities) + 1
        entities.append(dict(entity=canvas, name="Controls", components=dict(Canvas={}, CanvasScaler=dict(ui_scale_mode="ScaleWithScreenSize", reference_resolution=[960, 540]), RectTransform=dict(anchor_min=[0, 0], anchor_max=[1, 1], size_delta=[0, 0]))))
        controls = f"Normal Mapping - {pipeline}\n1: Built-in    2: URP\nLeft / right: move blue / orange\nN: toggle normal response\nR: reset    H: controls"
        entities.append(dict(entity=canvas + 1, parent=canvas, name="Light Controls", components=dict(RectTransform=dict(anchor_min=[0, 0], anchor_max=[0, 0], pivot=[0, 0], anchored_position=[16, 40], size_delta=[340, 140]), Text=dict(text=controls, font="Assets/Fonts/Roboto-Regular.ttf", font_size=18, alignment="Left", vertical_align="Top", raycast_target=False))))
        write_json(output / variant["scene"], dict(version=3, name=f"Normal Mapping {pipeline}", world=gamma_scene(dict(entities=entities, clear_color=[camera["m_BackGroundColor"][k] for k in "rgb"] + [1]))))
    data = dict(cameraPosition=camera_position, cameraSize=camera["orthographic size"], cells=reference_cells, variants=variants)
    (output / "Assets/Scripts/Data.ts").write_text("/** Pinned official scene and light data. */\nconst normalData = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
    write_json(output / "project.json", dict(name="Unity Normal Mapping", version=1, language="typescript", mainScene=variants[0]["scene"], buildScenes=[v["scene"] for v in variants], startupScript="Assets/Scripts/Main.ts", assetMode="all"))
    shutil.copyfile(source.source / "Assets/Tilemap/Normal Mapping (Built-in)/Sprites/normalmap.png", output / "Assets/Sprites/normalmap.png")
    shutil.copyfile(repo / "scripts/templates/unity-normal-mapping.ts", output / "Assets/Scripts/Main.ts")
    shutil.copyfile(repo / "samples/types/engine.d.ts", output / "Assets/Scripts/mengine.d.ts")
    shutil.copyfile(source.source / "LICENSE.md", output / "UNITY-LICENSE.md")
    for folder in ("Fonts", "Materials", "Shaders"):
        (output / "Assets" / folder).mkdir(exist_ok=True)
    for filename in ("Roboto-Regular.ttf", "LICENSE.txt"):
        shutil.copyfile(repo / "samples/unity-palette-swap/Assets/Fonts" / filename, output / "Assets/Fonts" / filename)
    shutil.copyfile(repo / "scripts/templates/unity-normal-mapping.mshader", output / "Assets/Shaders/Normal.mshader")
    write_json(output / "Assets/Materials/Normal.mmat", dict(version=10, name="Normal mapped sprite", shader="custom", custom_shader="Assets/Shaders/Normal.mshader", custom_textures=dict(normal="Assets/Sprites/normalmap.png"), surface="transparent", base_color=[1, 1, 1, 1], wrap_u="clamp", wrap_v="clamp", filter="nearest"))
    write_json(output / "SOURCE.json", dict(repository="https://github.com/Unity-Technologies/2d-techdemos", commit=COMMIT, scenes=[f"Assets/Tilemap/Normal Mapping ({v['title']})/Scene/normalmapping.unity" for v in variants], license="MIT", sourceCells=16, adaptations=["Both variants retain all source cells, sprite/normal atlases, camera and authored lights; count as one logical demo.", "Built-in is adapted to per-pixel Lambert diffuse plus source flat ambient and analytic point attenuation. Unity Standard BRDF/specular and baked attenuation lookup are not reproduced.", "URP retains its authored disabled normal lighting, inner/outer radius 3/7 and falloff .5; N enables optional normal response at source normal-map distance 3. No shadow occluders are authored in this scene.", "Main sprite uses nearest sampling; normal atlas is sampled as linear data. Sprite uv1 supplies live world position and its tangent frame accounts for rotation and flips.", "Light transforms drive per-sprite MaterialPropertyBlock parameters. This custom shader owns its two lights independently of the engine Light2D component.", "Runtime light dragging, normal toggle and pipeline switching extend the source static demonstration. Numeric colors follow source Gamma; ACES is disabled."]))
    (output / "README.md").write_text(f"""# Normal Mapping

来自 Unity 官方 [2d-techdemos](https://github.com/Unity-Technologies/2d-techdemos/tree/{COMMIT}/Assets/Tilemap)（MIT）。Built-in / URP 两个场景合计一个演示，均保留 16 格、四个 Sprite 切片、diffuse/normal 图集、相机与两盏灯的源参数。

1/2 切换场景；左/右键移动蓝/橙灯；N 开关法线响应；R 重开；H 隐藏提示。源项目为静态展示，运行时操作是本引擎扩展。URP 初始法线开关遵循源场景的关闭状态。

自定义材质逐像素采样线性法线，世界坐标与切线由 Sprite 渲染器传入。Built-in 使用 Lambert 漫反射、源环境色和解析距离衰减，未复现 Unity Standard 的完整 BRDF 与衰减查找表，不宣称与 Unity 最终像素完全一致。详细适配见 `SOURCE.json`。

导入：`python scripts/import-unity-normal-mapping.py <2d-techdemos checkout>`。验收：`node scripts/qa-unity-normal-mapping.mjs`，需独立编辑器配置环境变量。
""", encoding="utf-8")
    print("Imported Normal Mapping: 2 variants, 16 cells each, 4 slices, 2 authored lights each")


if __name__ == "__main__":
    main()

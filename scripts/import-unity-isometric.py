"""Import the pinned Isometric Z As Y scene, sprite pivots, animation and collision data."""
import json
import math
from pathlib import Path
import runpy
import shutil
import sys
import yaml
from PIL import Image
from unity_tile_source import COMMIT, UnityTiles, documents, gamma_scene, write_json


def main():
    repo = Path(__file__).resolve().parents[1]
    output = repo / "samples/unity-isometric-z-as-y"
    source = UnityTiles(sys.argv[1], output)
    relative = "Assets/Tilemap/IsometricZAsY/Scenes/Scene_Biome_Desert_ZAsY.unity"
    expanded = runpy.run_path(str(repo / "scripts/import-unity-physics.py"))["expanded_scene"]
    docs = expanded(source, source.source / relative)
    parts, transforms, scripts = {}, {}, {}
    for key, doc in docs.items():
        kind, value = next(iter(doc.items()))
        go = value.get("m_GameObject", {}).get("fileID")
        if go:
            parts.setdefault(go, {})[kind] = value
            if kind == "Transform": transforms[go] = key
            if kind == "MonoBehaviour": scripts.setdefault(go, []).append(value)
    cache = {}
    def world(key):
        if key in cache: return cache[key]
        t = docs[key]["Transform"]
        p, s = [t["m_LocalPosition"][k] for k in "xyz"], [t["m_LocalScale"][k] for k in "xyz"]
        q = t["m_LocalRotation"]
        assert abs(q["x"]) < 1e-6 and abs(q["y"]) < 1e-6
        angle = 2 * math.atan2(q["z"], q["w"])
        if t["m_Father"]["fileID"]:
            pp, ps, pa = world(t["m_Father"]["fileID"])
            x, y = p[0] * ps[0], p[1] * ps[1]
            p = [pp[0] + x * math.cos(pa) - y * math.sin(pa), pp[1] + x * math.sin(pa) + y * math.cos(pa), pp[2] + p[2] * ps[2]]
            s = [a * b for a, b in zip(s, ps)]; angle += pa
        cache[key] = p, s, angle
        return cache[key]
    def active(go):
        if not docs[go]["GameObject"]["m_IsActive"]: return False
        parent = docs[transforms[go]]["Transform"]["m_Father"]["fileID"]
        return active(docs[parent]["Transform"]["m_GameObject"]["fileID"]) if parent else True
    def transform(go):
        p, s, a = world(transforms[go])
        return dict(position=p, scale=s, rotation=[0, 0, math.sin(a / 2), math.cos(a / 2)])
    def sprite(ref):
        path = source.paths[ref["guid"]]
        meta = yaml.safe_load(Path(str(path) + ".meta").read_text(encoding="utf-8-sig"))["TextureImporter"]
        assert meta["spriteMode"] == 1
        with Image.open(path) as image: size = [image.width / meta["spritePixelsToUnits"], image.height / meta["spritePixelsToUnits"]]
        pivot = [meta["spritePivot"][k] for k in "xy"] if meta["alignment"] == 9 else [[.5,.5], [0,1], [.5,1], [1,1], [0,.5], [1,.5], [0,0], [.5,0], [1,0]][meta["alignment"]]
        return dict(sprite=source.sprite(ref), size=size, pivot=pivot, material="Assets/Materials/Point.mmat")
    def order(position): return round((-position[1] * .5 + position[2] * .25) * 100000) * 10
    entities = []
    def add(name, components):
        e = dict(entity=len(entities) + 1, name=name, components=components); entities.append(e); return e
    camera_go = next(go for go, p in parts.items() if "Camera" in p)
    camera = parts[camera_go]["Camera"]
    ct = transform(camera_go); ct["position"][2] = 10
    add("Main Camera", dict(Transform=ct, Camera2D=dict(size=camera["orthographic size"])))
    ground_count = 0
    for go, p in parts.items():
        if "Tilemap" not in p or "Collider" in docs[go]["GameObject"]["m_Name"]: continue
        t = p["Tilemap"]
        assert list(t["m_TileAnchor"].values()) == [0, 0, 0]
        for cell in t["m_Tiles"]:
            x, y, z = [cell["first"][k] for k in "xyz"]; c = cell["second"]
            matrix = t["m_TileMatrixArray"][c["m_TileMatrixIndex"]]["m_Data"]
            assert all(matrix[f"e{i}{j}"] == int(i == j) for i in range(4) for j in range(4))
            ref = t["m_TileSpriteArray"][c["m_TileSpriteIndex"]]["m_Data"]
            pos = [(x - y) * .5, (x + y + z) * .25, z]
            r = sprite(ref); r["sorting_order"] = order(pos) + ground_count
            add(f"Ground {x} {y} {z}", dict(Transform=dict(position=pos), SpriteRenderer=r)); ground_count += 1
    player_go = "s:2501001021266614073"
    player_render = None
    for go, p in parts.items():
        if "SpriteRenderer" not in p: continue
        if any(source.paths.get(b["m_Script"]["guid"], Path()).name == "HideTilemapColliderOnPlay.cs" for b in scripts.get(go, [])): continue
        r = p["SpriteRenderer"]
        if not r["m_Enabled"] or not active(go): continue
        group = go
        while "SortingGroup" not in parts[group]:
            parent = docs[transforms[group]]["Transform"]["m_Father"]["fileID"]
            if not parent: break
            group = docs[parent]["Transform"]["m_GameObject"]["fileID"]
        tr = transform(go); render = sprite(r["m_Sprite"])
        render.update(color=[r["m_Color"][k] for k in "rgba"], flip_x=bool(r["m_FlipX"]), flip_y=bool(r["m_FlipY"]), sorting_order=order(world(transforms[group])[0]) + r["m_SortingOrder"])
        name = docs[go]["GameObject"]["m_Name"]
        if group == player_go:
            name = "Witch"; player_render = dict(offset=[tr["position"][i] - transform(player_go)["position"][i] for i in range(3)])
        add(name + ("" if name == "Witch" else f" {go}"), dict(Transform=tr, SpriteRenderer=render))
    assert player_render is not None and ground_count == 284
    body = parts[player_go]["Rigidbody2D"]
    player = add("Player", dict(Transform=transform(player_go), Rigidbody2D=dict(body_type="dynamic", mass=body["m_Mass"], gravity_scale=0, linear_damping=0, angular_damping=body["m_AngularDamping"], freeze_rotation=True), CircleCollider2D=dict(radius=.1, offset=[-.011,.0725], friction=.4)))
    witch = next(e for e in entities if e["name"] == "Witch")
    witch["parent"] = player["entity"]
    witch["components"]["Transform"]["position"] = player_render["offset"]
    collider_groups, collision_data, trigger_data = {}, [], []
    native = json.loads((repo / "docs/designs/unity-demos/isometric-native-colliders.json").read_text())
    for go, p in parts.items():
        if "TilemapCollider2D" not in p: continue
        name = docs[go]["GameObject"]["m_Name"]
        collider_id = next(key for key, doc in docs.items() if doc.get("TilemapCollider2D", {}).get("m_GameObject", {}).get("fileID") == go)
        comp = p["CompositeCollider2D"]
        paths = comp["m_CompositePaths"]["m_Paths"]
        if p["TilemapCollider2D"]["m_CompositeOperation"] == 1:
            assert paths
            shapes = [dict(type="Edges", radius=comp["m_EdgeRadius"], points=path + [path[0]]) for path in paths]
        else: shapes = next(m["shapes"] for m in native["maps"] if m["name"] == name)
        collider_groups[collider_id] = []
        for i, shape in enumerate(shapes):
            kind = "EdgeCollider2D" if shape["type"] == "Edges" else "PolygonCollider2D"
            value = dict(points=[[v[k] for k in "xy"] for v in shape["points"]], friction=.4)
            if kind == "EdgeCollider2D": value["edge_radius"] = shape["radius"]
            entity_name = f"{name} Shape {i}"
            c = dict(Transform=transform(go))
            if active(go): c[kind] = value
            add(entity_name, c); collider_groups[collider_id].append(entity_name)
            collision_data.append(dict(name=entity_name, kind=kind, value=value))
    for key, doc in docs.items():
        if "PolygonCollider2D" not in doc: continue
        c = doc["PolygonCollider2D"];go = c["m_GameObject"]["fileID"]
        collider_groups[key] = []
        for i, points in enumerate(c["m_Points"]["m_Paths"]):
            name = f"Palm Collider {key} {i}"; value = dict(points=[[v[k] for k in "xy"] for v in points], offset=[c["m_Offset"][k] for k in "xy"], friction=.4)
            components = dict(Transform=transform(go))
            if active(go): components["PolygonCollider2D"] = value
            add(name, components); collider_groups[key].append(name); collision_data.append(dict(name=name, kind="PolygonCollider2D", value=value))
    for go, p in parts.items():
        if "EdgeCollider2D" not in p: continue
        c = p["EdgeCollider2D"]
        b = next(b for b in scripts[go] if "height" in b)
        name = f"Height Trigger {go}"
        add(name, dict(Transform=transform(go), EdgeCollider2D=dict(points=[[v[k] for k in "xy"] for v in c["m_Points"]], offset=[c["m_Offset"][k] for k in "xy"], is_trigger=True)))
        trigger_data.append(dict(name=name, height=b["height"], enable=[n for r in b["enableCollider"] for n in collider_groups[r["fileID"]]], disable=[n for r in b["disableCollider"] for n in collider_groups[r["fileID"]]]))
    animations = {}
    for path in (source.source / "Assets/Tilemap/IsometricZAsY/Characters").rglob("*.anim"):
        clip = next(iter(documents(path).values()))["AnimationClip"]
        curves = clip["m_PPtrCurves"]
        if not curves: continue
        flags = dict(flip_x=False, flip_y=False)
        for curve in clip["m_FloatCurves"]:
            assert curve["attribute"] in ("m_FlipX", "m_FlipY") and len(curve["curve"]["m_Curve"]) == 1
            flags["flip_x" if curve["attribute"] == "m_FlipX" else "flip_y"] = bool(curve["curve"]["m_Curve"][0]["value"])
        animations[clip["m_Name"]] = [{**sprite(k["value"]), **flags} for k in curves[0]["curve"]]
    assert len(animations) == 16 and all(len(animations[f"Run {d}"]) == 6 for d in ["N","NW","W","SW","S","SE","E","NE"])
    data = dict(player=player["entity"], render=player_render, animations=animations, colliders=collision_data, triggers=trigger_data)
    (output / "Assets/Scripts/Data.ts").write_text("/** Pinned Unity scene and animation data. */\nconst isoData = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
    write_json(output / "Assets/Scenes/Main.mscene", dict(version=3, name="Isometric Z As Y", world=gamma_scene(dict(entities=entities, clear_color=[camera["m_BackGroundColor"][k] for k in "rgba"]))))
    write_json(output / "project.json", dict(name="Unity Isometric Z As Y", version=1, language="typescript", mainScene="Assets/Scenes/Main.mscene", buildScenes=["Assets/Scenes/Main.mscene"], startupScript="Assets/Scripts/Main.ts", assetMode="all"))
    shutil.copyfile(repo / "scripts/templates/unity-isometric.ts", output / "Assets/Scripts/Main.ts")
    shutil.copyfile(repo / "samples/types/engine.d.ts", output / "Assets/Scripts/mengine.d.ts")
    shutil.copyfile(source.source / "LICENSE.md", output / "UNITY-LICENSE.txt")
    (output / "Assets/Materials").mkdir(exist_ok=True)
    (output / "Assets/Shaders").mkdir(exist_ok=True)
    (output / "Assets/Shaders/Point.mshader").write_text("fn mengine_ui_hook(input: MEngineUiInput) -> vec4<f32> { return mengine_ui_main_texture(input.uv0) * input.vertex_color; }\n", encoding="utf-8")
    write_json(output / "Assets/Materials/Point.mmat", dict(version=10, name="Point sampled sprites", shader="custom", custom_shader="Assets/Shaders/Point.mshader", surface="transparent", base_color=[1,1,1,1], filter="nearest"))
    write_json(output / "SOURCE.json", dict(repository="https://github.com/Unity-Technologies/2d-techdemos", commit=COMMIT, scene=relative, license="MIT", groundCells=ground_count, colliderCells=[92,45,25], triggers=6, animations=16, adaptations=["Source sprite pixels, PPU, pivots, prefab transforms and animation frames are preserved. Cached per-cell sprites preserve the authored map.", "Base/Level1 use the serialized source composite outlines and 0.05 edge radius. Level2 uses native Unity 2022.3.47f1c1 shapes generated from the source tile sprite physics outlines; the source project targets Unity 6.", "Rapier2D solves filled polygon, circle and rounded-edge collisions. Trigger exit switches the source collider groups and height while preserving player XY.", "SortingGroup order and camera custom axis (0,.5,-.25) are mapped to SpriteRenderer sorting_order. Input is WASD/arrows; R reloads. Movement speed is 2 units/s; run animation is 12 FPS.", "The source SmoothDamp camera expression is reproduced, including its per-update velocity and maximum-speed arguments. Pixel Perfect component resolution scaling is not reproduced."]))
    (output / "README.md").write_text("# Isometric Z As Y\n\nUnity 官方 MIT 示例。WASD / 方向键行走，R 重开。沿三处阶梯切换高度；人物受原生碰撞约束，八方向动画、相机跟随与遮挡排序同步更新。\n\n保留 284 格地形和源装饰；碰撞来自官方轮廓与隔离 Unity probe。Rapier2D 与 Box2D 的求解轨迹可能不同，细节与固定来源见 SOURCE.json。\n", encoding="utf-8")
    print(f"Imported {ground_count} ground tiles, {len(collision_data)} collision shapes, {len(trigger_data)} height triggers, {len(animations)} clips")


if __name__ == "__main__": main()

"""Import four pinned public-domain Unity PhysicsExamples2D scenes and prefab overrides."""
import json
import math
from pathlib import Path
import shutil
import sys
import yaml
from PIL import Image
from unity_tile_source import UnityTiles, documents, gamma_scene, write_json

COMMIT = "873d60529b7e4735bdc8821048e728e42d3a0fad"
SCENES = {"bounce": "Materials/PhysicsMaterial2D_Bounce", "friction": "Materials/PhysicsMaterial2D_Friction", "box-stacked": "Colliders/BoxCollider2D_Stacked", "circle-stacked": "Colliders/CircleCollider2D_Stacked"}


def reference_ids(value, prefix):
    if isinstance(value, dict):
        if "fileID" in value and "guid" not in value:
            return {**value, "fileID": f"{prefix}:{value['fileID']}" if value["fileID"] else 0}
        return {k: reference_ids(v, prefix) for k, v in value.items()}
    if isinstance(value, list):
        return [reference_ids(v, prefix) for v in value]
    return value


def expanded_scene(source, path):
    raw = documents(path)
    result = {f"s:{key}": reference_ids(value, "s") for key, value in raw.items()}
    aliases = {}
    for key, doc in raw.items():
        value = next(iter(doc.values()))
        if value.get("m_CorrespondingSourceObject", {}).get("fileID") and value.get("m_PrefabInstance", {}).get("fileID"):
            aliases[f"s:{key}"] = f"{value['m_PrefabInstance']['fileID']}:{value['m_CorrespondingSourceObject']['fileID']}"
    for instance_id, wrapper in raw.items():
        if "PrefabInstance" not in wrapper:
            continue
        instance = wrapper["PrefabInstance"]
        guid = instance["m_SourcePrefab"]["guid"]
        prefab = documents(source.paths[guid])
        changes = instance["m_Modification"]
        for change in changes["m_Modifications"]:
            assert change["target"]["guid"] == guid
            value = next(iter(prefab[change["target"]["fileID"]].values()))
            keys = change["propertyPath"].split(".")
            for key in keys[:-1]:
                value = value.setdefault(key, {})
            previous = value.get(keys[-1])
            if isinstance(previous, dict) and "fileID" in previous:
                value[keys[-1]] = change["objectReference"]
            elif isinstance(previous, (float, int)):
                number = float(change["value"] or 0)
                value[keys[-1]] = int(number) if number.is_integer() else number
            else:
                value[keys[-1]] = change["value"]
        for removed in changes["m_RemovedComponents"]:
            prefab.pop(removed["fileID"], None)
        for key, doc in prefab.items():
            if "Prefab" in doc:
                continue
            mapped = reference_ids(doc, str(instance_id))
            if "Transform" in mapped and not doc["Transform"]["m_Father"]["fileID"]:
                mapped["Transform"]["m_Father"] = reference_ids(changes["m_TransformParent"], "s")
            result[f"{instance_id}:{key}"] = mapped
    def alias(value):
        if isinstance(value, dict):
            return {k: aliases.get(v, v) if k == "fileID" else alias(v) for k, v in value.items()}
        if isinstance(value, list):
            return [alias(v) for v in value]
        return value
    return {key: alias(value) for key, value in result.items() if key not in aliases and "PrefabInstance" not in value}


def main():
    repo = Path(__file__).resolve().parents[1]
    for slug, relative in SCENES.items():
        output = repo / f"samples/unity-physics-{slug}"
        source = UnityTiles(sys.argv[1], output, COMMIT)
        docs = expanded_scene(source, source.source / f"Assets/Scenes/{relative}.unity")
        transforms = {key: doc["Transform"] for key, doc in docs.items() if "Transform" in doc and "m_LocalPosition" in doc["Transform"]}
        by_object = {}
        for key, doc in docs.items():
            kind, value = next(iter(doc.items()))
            if "m_GameObject" in value:
                by_object.setdefault(value["m_GameObject"]["fileID"], {})[kind] = value
        object_transforms = {value["m_GameObject"]["fileID"]: key for key, value in transforms.items()}
        world_cache = {}
        def world_transform(key):
            if key in world_cache:
                return world_cache[key]
            t = transforms[key]
            assert abs(t["m_LocalRotation"]["x"]) < 1e-6 and abs(t["m_LocalRotation"]["y"]) < 1e-6
            p, s = [t["m_LocalPosition"][k] for k in "xyz"], [t["m_LocalScale"][k] for k in "xyz"]
            angle = 2 * math.atan2(t["m_LocalRotation"]["z"], t["m_LocalRotation"]["w"])
            parent = t["m_Father"]["fileID"]
            if parent:
                pp, ps, pa = world_transform(parent)
                px, py = p[0] * ps[0], p[1] * ps[1]
                p = [pp[0] + px * math.cos(pa) - py * math.sin(pa), pp[1] + px * math.sin(pa) + py * math.cos(pa), pp[2] + p[2] * ps[2]]
                s = [a * b for a, b in zip(s, ps)]
                angle += pa
            world_cache[key] = p, s, angle
            return p, s, angle
        def material(reference):
            if not reference or not reference.get("fileID"):
                return dict(friction=.4, bounciness=0)
            value = next(iter(documents(source.paths[reference["guid"]]).values()))["PhysicsMaterial2D"]
            return dict(friction=value["friction"], bounciness=value["bounciness"])
        def components(parts, transform):
            p, scale, angle = transform
            result = dict(Transform=dict(position=p, scale=scale, rotation=[0, 0, math.sin(angle / 2), math.cos(angle / 2)]))
            body = parts.get("Rigidbody2D")
            if body:
                assert body["m_Constraints"] in (0, 4)
                result["Rigidbody2D"] = dict(body_type=["dynamic", "kinematic", "fixed"][body["m_BodyType"]], mass=body["m_Mass"], gravity_scale=body["m_GravityScale"], linear_damping=body["m_LinearDrag"], angular_damping=body["m_AngularDrag"], freeze_rotation=body["m_Constraints"] == 4, ccd=body["m_CollisionDetection"] != 0)
            for name in ("BoxCollider2D", "CircleCollider2D", "EdgeCollider2D"):
                if name not in parts:
                    continue
                c = parts[name]
                reference = c["m_Material"] if c["m_Material"]["fileID"] else body.get("m_Material") if body else None
                value = dict(offset=[c["m_Offset"][k] for k in "xy"], is_trigger=bool(c["m_IsTrigger"]), **material(reference))
                if name == "BoxCollider2D":
                    value["size"] = [c["m_Size"][k] for k in "xy"]
                elif name == "CircleCollider2D":
                    value["radius"] = c["m_Radius"]
                else:
                    assert c["m_EdgeRadius"] == 0
                    value["points"] = [[v[k] for k in "xy"] for v in c["m_Points"]]
                result[name] = value
            if "SpriteRenderer" in parts:
                sprite = parts["SpriteRenderer"]
                ref = sprite["m_Sprite"]
                path = source.paths[ref["guid"]]
                meta = yaml.safe_load(Path(str(path) + ".meta").read_text(encoding="utf-8-sig"))["TextureImporter"]
                assert meta["spriteMode"] in (1, 3) and meta["alignment"] == 0
                with Image.open(path) as image:
                    size = [image.width / meta["spritePixelsToUnits"], image.height / meta["spritePixelsToUnits"]]
                draw_size = [sprite["m_Size"][k] for k in "xy"] if sprite["m_DrawMode"] == 2 else size
                result["SpriteRenderer"] = dict(sprite=source.sprite(ref), material="Assets/Materials/Sprite.mmat", size=draw_size, color=[sprite["m_Color"][k] for k in "rgba"], sorting_order=sprite["m_SortingOrder"], flip_x=bool(sprite["m_FlipX"]), flip_y=bool(sprite["m_FlipY"]))
                sides = 0
                if path.name == "Circle.png":
                    outline = meta["spriteSheet"]["outline"][0]
                    sides = len(outline)
                    assert sides == 128 and all(abs(math.hypot(v["x"], v["y"]) - 2) < .00001 for v in outline)
                result["MaterialPropertyBlock"] = dict(custom_parameter_names=["tiling"], custom_parameter_values=[[draw_size[0] / size[0], draw_size[1] / size[1], sides, 0]])
            return result
        camera_parts = next(parts for parts in by_object.values() if "Camera" in parts)
        camera = camera_parts["Camera"]
        assert camera["orthographic size"] == 3
        entities = [dict(entity=1, name="Main Camera", components=dict(Transform=dict(position=[0, 0, 10]), Camera2D=dict(size=3)))]
        source_entities, labels, spawners, drag = {}, [], [], None
        for object_id, parts in by_object.items():
            if object_id not in object_transforms:
                continue
            p, scale, angle = world_transform(object_transforms[object_id])
            name = docs[object_id]["GameObject"]["m_Name"]
            if any(key in parts for key in ("SpriteRenderer", "BoxCollider2D", "CircleCollider2D", "EdgeCollider2D")):
                value = components(parts, (p, scale, angle))
                entity = dict(entity=len(entities) + 1, name=f"{name} {object_id}", components=value)
                entity["components"]["Layer"] = dict(value=docs[object_id]["GameObject"]["m_Layer"])
                entities.append(entity)
                source_entities[object_id] = entity
                behaviour = parts.get("MonoBehaviour", {})
                if "m_Velocity" in behaviour:
                    value["Rigidbody2D"]["velocity"] = [behaviour["m_Velocity"][k] for k in "xy"]
                    value["Rigidbody2D"]["angular_velocity"] = behaviour["m_AngularVelocity"]
            if "TextMesh" in parts:
                labels.append(dict(source=object_id, position=p, text=parts["TextMesh"]["m_Text"], anchor=parts["TextMesh"]["m_Anchor"] ))
            behaviour = parts.get("MonoBehaviour", {})
            if "m_Frequency" in behaviour:
                drag = dict(frequency=behaviour["m_Frequency"], damping=behaviour["m_Damping"], layerMask=behaviour["m_DragLayers"]["m_Bits"])
            if "m_SpawnItems" in behaviour:
                assert behaviour["m_SpawnCount"] == 1 and behaviour["m_SpawnMaximum"] == 5 and behaviour["m_SpawnTime"] == 1 and behaviour["m_SpawnLifetime"] == 0 and behaviour["m_MinScale"] == behaviour["m_MaxScale"] == 1 and not behaviour["m_UseAutoMass"]
                prefab = documents(source.paths[behaviour["m_SpawnItems"][0]["guid"]])
                parts = {next(iter(doc)): next(iter(doc.values())) for doc in prefab.values()}
                template = components(parts, (p, [1, 1, 1], 0))
                template["Layer"] = dict(value=behaviour["m_Layer"])
                spawners.append(template)
        canvas = len(entities) + 1
        bodies = [e["components"] for e in entities if "Rigidbody2D" in e["components"]]
        if slug == "bounce":
            assert len(bodies) == 10
            for index, body in enumerate(sorted(bodies, key=lambda c: c["BoxCollider2D"]["bounciness"])):
                assert abs(body["Transform"]["position"][0] - (-4 + index * .9)) < .00001
        if slug == "friction":
            assert len(bodies) == 10
            for index, body in enumerate(sorted(bodies, key=lambda c: c["BoxCollider2D"]["friction"])):
                x, y = body["Transform"]["position"][:2]
                assert abs(x - (-4.6 if index < 5 else .4)) < .00001 and abs(y - (2.6 - (index % 5) * 1.2)) < .00001
        entities.append(dict(entity=canvas, name="Labels", components=dict(Canvas={}, CanvasScaler=dict(ui_scale_mode="ScaleWithScreenSize", reference_resolution=[960, 540]), RectTransform=dict(anchor_min=[0, 0], anchor_max=[1, 1], size_delta=[0, 0]))))
        bindings = []
        for label in labels:
            # Retain the authored world placement with readable overlay typography.
            horizontal = label["anchor"] % 3
            vertical = label["anchor"] // 3
            x, y = 480 + label["position"][0] * 90, 270 - label["position"][1] * 90
            width = 76 if slug == "bounce" and label["text"].startswith("Bounce\n") else 210 if label["text"].startswith("Friction") else 420
            height = 55
            x -= horizontal * width / 2
            y -= vertical * height / 2
            name = f"Label {label['source']}"
            entities.append(dict(entity=len(entities) + 1, parent=canvas, name=name, components=dict(RectTransform=dict(anchor_min=[0, 0], anchor_max=[0, 0], pivot=[0, 0], anchored_position=[x, y], size_delta=[width, height]), Text=dict(text=label["text"].replace("\n\n", "\n"), font="Assets/Fonts/Roboto-Regular.ttf", font_size=13, alignment=["Left", "Center", "Right"][horizontal], vertical_align="Top", raycast_target=False))))
            parent = transforms[object_transforms[label["source"]]]["m_Father"]["fileID"]
            if parent and transforms[parent]["m_GameObject"]["fileID"] in source_entities:
                owner = source_entities[transforms[parent]["m_GameObject"]["fileID"]]
                if "Rigidbody2D" in owner["components"]:
                    owner_position = owner["components"]["Transform"]["position"]
                    bindings.append(dict(label=name, owner=owner["name"], offset=[x - owner_position[0] * 90, y + owner_position[1] * 90]))
        entities.append(dict(entity=len(entities) + 1, parent=canvas, name="Playback Controls", components=dict(RectTransform=dict(anchor_min=[0, 0], anchor_max=[0, 0], pivot=[0, 0], anchored_position=[350, 514], size_delta=[320, 24]), Text=dict(text="R: restart    H: show / hide labels", font="Assets/Fonts/Roboto-Regular.ttf", font_size=13, alignment="Center", vertical_align="Top", raycast_target=False))))
        data = dict(slug=slug, cameraSize=3, drag=drag, spawners=spawners, labels=bindings)
        (output / "Assets/Scripts/Data.ts").write_text("/** Authored physics sample parameters, public domain. */\nconst physicsData: PhysicsSampleData = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
        write_json(output / "Assets/Scenes/Main.mscene", dict(version=3, name=relative.split("/")[-1], world=gamma_scene(dict(entities=entities, clear_color=[0, 0, 0, 1]))))
        write_json(output / "project.json", dict(name="Unity Physics " + slug, version=1, language="typescript", mainScene="Assets/Scenes/Main.mscene", buildScenes=["Assets/Scenes/Main.mscene"], startupScript="Assets/Scripts/Main.ts", assetMode="all"))
        shutil.copyfile(repo / "scripts/templates/unity-physics.ts", output / "Assets/Scripts/Main.ts")
        shutil.copyfile(repo / "samples/types/engine.d.ts", output / "Assets/Scripts/mengine.d.ts")
        shutil.copyfile(source.source / "License.txt", output / "UNITY-LICENSE.txt")
        shutil.copyfile(source.source / "Assets/Sprites/Platformer Art/license.txt", output / "KENNEY-LICENSE.txt")
        for folder in ("Fonts", "Materials", "Shaders"):
            (output / "Assets" / folder).mkdir(exist_ok=True)
        for filename in ("Roboto-Regular.ttf", "LICENSE.txt"):
            shutil.copyfile(repo / "samples/unity-palette-swap/Assets/Fonts" / filename, output / "Assets/Fonts" / filename)
        (output / "Assets/Shaders/Sprite.mshader").write_text('''/* MENGINE_PARAMETERS
{"parameters":[{"name":"tiling","type":"vector4","default":[1,1,0,0]}]}
*/
fn mengine_ui_hook(input: MEngineUiInput) -> vec4<f32> {
    let tiling = mengine_param_tiling(input.instance_index);
    if tiling.z > 2.0 {
        let point = input.uv0 - vec2<f32>(0.5);
        let step = 6.28318530718 / tiling.z;
        let angle = fract(atan2(point.x, point.y) / step) * step - step * 0.5;
        let edge = 0.5 * cos(step * 0.5) / cos(angle);
        if length(point) > edge { discard; }
    }
    return mengine_ui_main_texture(input.uv0 * tiling.xy) * input.vertex_color;
}
''', encoding="utf-8")
        write_json(output / "Assets/Materials/Sprite.mmat", dict(version=10, name="Point sampled tiled sprite", shader="custom", custom_shader="Assets/Shaders/Sprite.mshader", surface="transparent", base_color=[1, 1, 1, 1], wrap_u="repeat", wrap_v="repeat", filter="nearest"))
        write_json(output / "SOURCE.json", dict(repository="https://github.com/Unity-Technologies/PhysicsExamples2D", commit=COMMIT, branch="archive/2019", scene=f"Assets/Scenes/{relative}.unity", license="Unlicense; Kenney Platformer Art CC0", sourceDynamicBodies=sum("Rigidbody2D" in e["components"] for e in entities), sourceSpawners=len(spawners), adaptations=["Prefab overrides, removed components and transform parent chains are applied before import.", "Authored collider materials are flattened to friction/bounciness fields. Rapier2D uses geometric-mean friction and maximum restitution; solver trajectories can differ from Unity Box2D.", "Open EdgeCollider2D bounds and TargetJoint2D dragging run in the native physics solver. Joint total force is conservatively split between two world-axis motors.", "TextMesh content and world placement are mapped to a readable Roboto overlay; crate labels follow their simulated body. R/H controls are additions.", "Stacked scenes retain nine spawners, immediate spawn plus one per second up to five each, scale one and no lifetime. Random colors use a repeatable PRNG for reset verification.", "Tiled sprites use repeating UVs with their source dimensions. Source Gamma numeric colors are decoded and tone mapping is disabled."]))
        (output / "README.md").write_text(f"# {relative.split('/')[-1]}\n\n来源：Unity 官方 [PhysicsExamples2D archive/2019](https://github.com/Unity-Technologies/PhysicsExamples2D/tree/{COMMIT}/Assets/Scenes/{relative}.unity)，Unlicense；Platformer Art 为 Kenney CC0。\n\n" + ("播放后观察十个箱子的反弹高度。" if slug == "bounce" else "左键点击并拖动物体，释放鼠标移除 TargetJoint2D。") + "R 重开，H 显示/隐藏文字。\n\n保留源场景的 Sprite、位置、碰撞几何、摩擦/弹性与生成时序；使用本引擎 Rapier2D 求解，轨迹不宣称与 Box2D 逐帧相同。TextMesh 转为可读的 Roboto 叠加文字。来源和适配详见 SOURCE.json。\n", encoding="utf-8")
        print(f"Imported {slug}: {sum('Rigidbody2D' in e['components'] for e in entities)} dynamic bodies, {len(spawners)} spawners")


if __name__ == "__main__":
    main()

"""Import the pinned MIT Unity Destructible demo. Requires PyYAML and Pillow."""
import json
import math
from pathlib import Path
import shutil
import sys

from unity_tile_source import COMMIT, UnityTiles, documents, write_json


def main():
    source = Path(sys.argv[1]).resolve()
    output = Path(__file__).resolve().parents[1] / "samples/unity-destructible"
    importer = UnityTiles(source, output)
    sprite, asset = importer.sprite, importer.asset
    paths, imported = importer.paths, importer.imported

    def rules(guid):
        value = asset(guid)
        result = []
        for rule in value["m_TilingRules"]:
            packed = bytes.fromhex(rule["m_Neighbors"])
            neighbors = [int.from_bytes(packed[i:i + 4], "little") for i in range(0, len(packed), 4)]
            result.append(dict(sprite=sprite(rule["m_Sprites"][0]), rotate=rule["m_RuleTransform"] == 1, neighbors=neighbors,
                               positions=[[p["x"], p["y"]] for p in rule["m_NeighborPositions"]]))
        return dict(defaultSprite=sprite(value["m_DefaultSprite"]), rules=result)

    relative = "Assets/Tilemap/Destructible/Destructible.unity"
    docs = documents(source / relative)
    entities, cells = [], []

    def add(name, position, components, angle=0):
        transform = dict(position=position, rotation=[0, 0, math.sin(angle / 2), math.cos(angle / 2)], scale=[1, 1, 1])
        entities.append(dict(entity=len(entities) + 1, name=name, components=dict(Transform=transform, **components)))

    add("Main Camera", [0, 0, 10], dict(Camera2D=dict(size=8)))
    for doc in docs.values():
        if "Tilemap" not in doc:
            continue
        tilemap = doc["Tilemap"]
        name = docs[tilemap["m_GameObject"]["fileID"]]["GameObject"]["m_Name"]
        for cell in tilemap["m_Tiles"]:
            x, y = cell["first"]["x"], cell["first"]["y"]
            data = cell["second"]
            reference = tilemap["m_TileAssetArray"][data["m_TileIndex"]]["m_Data"]
            tile = asset(reference["guid"])["m_Name"]
            image = sprite(tilemap["m_TileSpriteArray"][data["m_TileSpriteIndex"]]["m_Data"])
            matrix = tilemap["m_TileMatrixArray"][data["m_TileMatrixIndex"]]["m_Data"]
            angle = math.atan2(matrix["e10"], matrix["e00"])
            entity_name = f"{name} {x} {y}"
            add(entity_name, [x + 0.5, y + 0.5, 0], dict(SpriteRenderer=dict(sprite=image, size=[1, 1], sorting_order=-1 if name == "Background" else 0)), angle)
            cells.append(dict(name=entity_name, layer=name, tile=tile, x=x, y=y))
    destructible = asset("bf0431a874bdd5b43ac4304f0a12b3b8")
    decals = [dict(sprite=sprite(group["m_Sprite"]), mask=group["m_MaskFilter"], variants={str(item["m_Mask"]): sprite(item["m_DecalSprite"]) for item in group["m_Decals"]}) for group in destructible["m_DecalGroups"]]
    clip = next(iter(documents(paths["397731921f0ace344a737069c8cc6868"]).values()))["AnimationClip"]
    explosions = [dict(time=key["time"], sprite=sprite(key["value"])) for key in clip["m_PPtrCurves"][0]["curve"]]
    data = dict(cells=cells, destructible=rules("8e3635754d59b824ca8ab3d0ab07686f"), floor=rules("f7b17acb93f1034439f61a0c35bad7c5"), decals=decals, explosions=explosions)
    by_name = {entity["name"]: entity for entity in entities}
    tiles = {(cell["x"], cell["y"]): cell["tile"] for cell in cells if cell["layer"] == "Foreground"}
    for cell in cells:
        if cell["tile"] != "Destructible":
            continue
        resolved, turns = data["destructible"]["defaultSprite"], 0
        for rule in data["destructible"]["rules"]:
            matched = False
            for turn in range(4 if rule["rotate"] else 1):
                matches = []
                for condition, position in zip(rule["neighbors"], rule["positions"]):
                    x, y = position
                    for _ in range(turn):
                        x, y = y, -x
                    same = tiles.get((cell["x"] + x, cell["y"] + y)) == cell["tile"]
                    matches.append(condition == 0 or (same if condition == 1 else not same))
                if all(matches):
                    resolved, turns, matched = rule["sprite"], turn, True
                    break
            if matched:
                break
        components = by_name[cell["name"]]["components"]
        components["SpriteRenderer"]["sprite"] = resolved
        angle = -turns * math.pi / 2
        components["Transform"]["rotation"] = [0, 0, math.sin(angle / 2), math.cos(angle / 2)]
    (output / "Assets/Scripts/Data.ts").write_text("/** Data converted from the official Unity MIT scene and tile assets. */\nconst sourceData = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
    write_json(output / "Assets/Scenes/Main.mscene", dict(version=3, name="Destructible", world=dict(entities=entities, clear_color=[0.19215687, 0.3019608, 0.4745098, 1])))
    write_json(output / "project.json", dict(name="Unity Destructible", version=1, language="typescript", mainScene="Assets/Scenes/Main.mscene", buildScenes=["Assets/Scenes/Main.mscene"], startupScript="Assets/Scripts/Main.ts", assetMode="all"))
    shutil.copyfile(output.parent / "types/engine.d.ts", output / "Assets/Scripts/mengine.d.ts")
    shutil.copyfile(source / "LICENSE.md", output / "UNITY-LICENSE.md")
    write_json(output / "SOURCE.json", dict(repository="https://github.com/Unity-Technologies/2d-techdemos", commit=COMMIT, scene=relative, license="MIT", adaptations=["Editable Sprite entities represent the source tile cells.", "Destructible cells evaluate the source neighbor rules to form connected terrain.", "TypeScript implements cross-shaped explosions, indestructible borders, neighbor rules and damage decals.", "Official explosion sprite keyframes retain their source timings."]))
    print(f"Imported {len(cells)} cells and {len(imported)} sprite sheets into {output}")


if __name__ == "__main__":
    main()

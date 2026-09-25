"""Read the pinned MIT 2d-techdemos YAML and import its Sprite slices."""
import json
from pathlib import Path
import re
import shutil
import subprocess

from PIL import Image
import yaml

COMMIT = "6593d544df2ea598e51f5cf1d7165d5ed42ceba7"


def documents(path):
    source = Path(path).read_text(encoding="utf-8-sig")
    # Packed little-endian neighbors are strings, never YAML octal integers.
    source = re.sub(r'(?m)^([ \t]*(?:-[ \t]*)?(?:m_Neighbors|keyData): )([0-9a-f]+)[ \t]*$', r'\1"\2"', source)
    blocks = re.split(r'^--- !u!(\d+) &(-?\d+)(?: stripped)?\s*$', source, flags=re.M)
    return {int(blocks[i + 1]): yaml.safe_load(blocks[i + 2]) for i in range(1, len(blocks), 3)}


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def linear_color(color):
    """Decode Unity Gamma numeric RGB for MEngine's linear render attachments."""
    return [value if value in (0, 1) else value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in color[:3]] + [color[3]]


def gamma_scene(world):
    """Convert a freshly imported Gamma scene; source textures remain sRGB assets."""
    world["clear_color"] = linear_color(world["clear_color"])
    for entity in world["entities"]:
        components = entity["components"]
        if "Camera2D" in components:
            components["EnvironmentLight"] = dict(background_enabled=False, tone_mapping=False)
        for name in ["SpriteRenderer", "AnimatedSprite2D", "Text", "Image"]:
            if name in components and "color" in components[name]:
                components[name]["color"] = linear_color(components[name]["color"])
    return world


class UnityTiles:
    def __init__(self, source, output, commit=COMMIT):
        self.source, self.output = Path(source).resolve(), Path(output)
        revision = subprocess.check_output(["git", "-C", str(self.source), "rev-parse", "HEAD"], text=True).strip()
        if revision != commit:
            raise ValueError(f"Expected Unity source commit {commit}")
        for folder in ["Assets/Scenes", "Assets/Scripts", "Assets/Sprites"]:
            (self.output / folder).mkdir(parents=True, exist_ok=True)
        self.paths, self.imported = {}, {}
        for path in (self.source / "Assets").rglob("*.meta"):
            match = re.search(r"^guid: (\w+)", path.read_text(encoding="utf-8-sig"), re.M)
            if match:
                self.paths[match[1]] = Path(str(path)[:-5])

    def asset(self, guid, file_id=11400000):
        return documents(self.paths[guid])[file_id]["MonoBehaviour"]

    def sprite(self, reference):
        if reference["fileID"] == 0:
            return ""
        guid = reference["guid"]
        if guid not in self.imported:
            path = self.paths[guid]
            meta = yaml.safe_load(Path(str(path) + ".meta").read_text(encoding="utf-8-sig"))["TextureImporter"]
            destination = self.output / "Assets/Sprites" / path.name
            if any(name == path.name for name, _ in self.imported.values()):
                raise ValueError(f"Duplicate source texture filename: {path.name}")
            shutil.copyfile(path, destination)
            with Image.open(path) as image:
                width, height = image.size
            slices, names = [], {}
            items = meta["spriteSheet"]["sprites"]
            if not items:
                items = [dict(internalID=21300000, name=path.stem, rect=dict(x=0, y=0, width=width, height=height), alignment=meta["alignment"], pivot=meta["spritePivot"])]
            pivots = [[.5,.5], [0,1], [.5,1], [1,1], [0,.5], [1,.5], [0,0], [.5,0], [1,0]]
            for item in items:
                rect, name = item["rect"], item["name"]
                names[item["internalID"]] = name
                slices.append(dict(name=name, rect=[rect["x"], height - rect["y"] - rect["height"], rect["width"], rect["height"]], pivot=([item["pivot"][k] for k in "xy"] if item["alignment"] == 9 else pivots[item["alignment"]])))
            write_json(Path(str(destination) + ".sprite.json"), dict(version=1, mode="multiple", pixels_per_unit=meta["spritePixelsToUnits"], slices=slices))
            self.imported[guid] = (path.name, names)
        filename, names = self.imported[guid]
        return "Assets/Sprites/" + filename + ("#" + names[reference["fileID"]] if names else "")

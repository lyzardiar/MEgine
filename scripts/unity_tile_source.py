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
    source = re.sub(r'(?m)^(\s*m_Neighbors: )([0-9a-f]+)$', r'\1"\2"', source)
    blocks = re.split(r'^--- !u!(\d+) &(-?\d+)(?: stripped)?\s*$', source, flags=re.M)
    return {int(blocks[i + 1]): yaml.safe_load(blocks[i + 2]) for i in range(1, len(blocks), 3)}


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


class UnityTiles:
    def __init__(self, source, output):
        self.source, self.output = Path(source).resolve(), Path(output)
        revision = subprocess.check_output(["git", "-C", str(self.source), "rev-parse", "HEAD"], text=True).strip()
        if revision != COMMIT:
            raise ValueError(f"Expected Unity 2d-techdemos commit {COMMIT}")
        for folder in ["Assets/Scenes", "Assets/Scripts", "Assets/Sprites"]:
            (self.output / folder).mkdir(parents=True, exist_ok=True)
        self.paths, self.imported = {}, {}
        for path in (self.source / "Assets").rglob("*.meta"):
            match = re.search(r"^guid: (\w+)", path.read_text(encoding="utf-8-sig"), re.M)
            if match:
                self.paths[match[1]] = Path(str(path)[:-5])

    def asset(self, guid):
        return next(iter(documents(self.paths[guid]).values()))["MonoBehaviour"]

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
                height = image.height
            slices, names = [], {}
            for item in meta["spriteSheet"]["sprites"]:
                rect, name = item["rect"], item["name"]
                names[item["internalID"]] = name
                slices.append(dict(name=name, rect=[rect["x"], height - rect["y"] - rect["height"], rect["width"], rect["height"]], pivot=[0.5, 0.5]))
            write_json(Path(str(destination) + ".sprite.json"), dict(version=1, mode="multiple", pixels_per_unit=meta["spritePixelsToUnits"], slices=slices))
            self.imported[guid] = (path.name, names)
        filename, names = self.imported[guid]
        return "Assets/Sprites/" + filename + ("#" + names[reference["fileID"]] if names else "")

"""Check native readback against independent CPU normal-map lighting samples."""
import json
import math
from pathlib import Path
import sys
from PIL import Image

capture, root, variant_index = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])
data = json.loads((root / "Assets/Scripts/Data.ts").read_text(encoding="utf-8").split("= ", 1)[1].strip().rstrip(";"))
variant = data["variants"][variant_index]
overrides = {}
if len(sys.argv) > 4:
    overrides = json.loads(sys.argv[4])
    variant["options"][0] = overrides.get("normal", variant["options"][0])
    for name in ("blue", "orange"):
        if name in overrides:
            variant["lights"][name]["position"][:2] = overrides[name]
camera = data["cameraPosition"]
image = Image.open(capture).convert("RGBA")
diffuse = Image.open(root / "Assets/Sprites/sprites.png").convert("RGBA")
normals = Image.open(root / "Assets/Sprites/normalmap.png").convert("RGBA")
slices = {s["name"]: s["rect"] for s in json.loads((root / "Assets/Sprites/sprites.png.sprite.json").read_text())["slices"]}
scale = round(image.width * 9 / 16) / (data["cameraSize"] * 2)
assert max(abs(v - 69) for v in image.getpixel((20, image.height // 2))[:3]) <= 1, "source Gamma background"
maximum, count, black = 0, 0, 0
for cell in data["cells"]:
    rect = slices[cell["sprite"].split("#")[1]]
    for ty in (2, 5, 8, 11, 14):
        for tx in (2, 5, 8, 11, 14):
            wx, wy = cell["x"] + (tx + .5) / 16, cell["y"] + 1 - (ty + .5) / 16
            px, py = round(image.width / 2 + (wx - camera[0]) * scale - .5), round(image.height / 2 - (wy - camera[1]) * scale - .5)
            wx, wy = (px + .5 - image.width / 2) / scale + camera[0], (image.height / 2 - py - .5) / scale + camera[1]
            sx, sy = int((wx - cell["x"]) * 16) + rect[0], int((cell["y"] + 1 - wy) * 16) + rect[1]
            flipped = overrides.get("flipY") == [cell["x"], cell["y"]]
            if flipped:
                sy = rect[1] + 15 - (sy - rect[1])
            color = diffuse.getpixel((sx, sy))
            if color[3] != 255:
                continue
            normal = [v / 255 * 2 - 1 for v in normals.getpixel((sx, sy))[:3]]
            norm = math.sqrt(sum(v * v for v in normal))
            normal = [v / norm for v in normal]
            if flipped:
                normal[1] *= -1
            light_sum = variant["ambient"][:3].copy()
            for light in variant["lights"].values():
                lx, ly, lz, radius = light["position"]
                offset = [lx - wx, ly - wy, lz + variant["options"][2]]
                distance = math.hypot(*offset[:2])
                attenuation = max(0, 1 - distance * distance / (radius * radius)) / (1 + 25 * distance * distance / (radius * radius))
                if variant["options"][1]:
                    attenuation = max(0, min(1, (radius - distance) / max(radius - 3, .001))) ** .5
                direction_length = max(math.sqrt(sum(v * v for v in offset)), .0001)
                response = max(0, sum(a * b for a, b in zip(normal, offset)) / direction_length) if variant["options"][0] else 1
                for i in range(3):
                    light_sum[i] += light["color"][i] * light["color"][3] * attenuation * response
            expected = [round(max(0, min(255, color[i] * light_sum[i]))) for i in range(3)]
            actual = image.getpixel((px, py))[:3]
            delta = max(abs(a - b) for a, b in zip(actual, expected))
            assert delta <= 4, f"{variant['title']} world {wx, wy}, atlas {sx, sy}: {actual}, expected {expected}, error {delta}"
            count += 1
            black += max(color[:3]) == 0
            maximum = max(maximum, delta)
assert count > 100 and black > 0, (count, black)
print(json.dumps(dict(samples=count, blackOutlineSamples=black, maximumChannelError=maximum)))

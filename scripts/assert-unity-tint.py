"""Compare native viewport pixels with the source tint-map bilinear reference."""
import json
import math
from pathlib import Path
import sys
from PIL import Image

image = Image.open(sys.argv[1]).convert("RGBA")
source = Path(sys.argv[2]).read_text(encoding="utf-8")
data = json.loads(source.split("= ", 1)[1].strip().rstrip(";"))
# The QA Game panel uses its authored 16:9 display, centered inside the capture.
scale = round(image.width * 9 / 16) / (data["cameraSize"] * 2)
positions = [(-.5, -.5), (-.5, -1.5), (-.5, .5), (-.5, 1.5), (-.5, 2.5), (-1.75, 1.75), (-.25, -.75)] if data["smooth"] else [(-.5, -.5), (.5, -.5), (-.5, .5), (.5, .5)]
maximum = 0
for x, y in positions:
    px, py = round(image.width / 2 + x * scale), round(image.height / 2 - y * scale)
    if data["smooth"]:
        ix, iy = math.floor(x - .5), math.floor(y - .5)
        fx, fy = x - .5 - ix, y - .5 - iy
        colors = [data["tints"].get(f"{ix + dx},{iy + dy}", [1] * 4) for dy in (0, 1) for dx in (0, 1)]
        expected = [round((round(colors[0][i] * 255) * (1 - fx) + round(colors[1][i] * 255) * fx) * (1 - fy) + (round(colors[2][i] * 255) * (1 - fx) + round(colors[3][i] * 255) * fx) * fy) for i in range(3)]
    else:
        expected = [round(v * 255) for v in data["tints"][f"{math.floor(x)},{math.floor(y)}"][:3]]
    actual = image.getpixel((px, py))
    delta = max(abs(a - b) for a, b in zip(actual, expected))
    assert delta <= 4, f"Tint pixel {(px, py)}: {actual}, expected {expected} (world {x}, {y})"
    maximum = max(maximum, delta)
print(json.dumps(dict(samples=len(positions), maximumChannelError=maximum)))

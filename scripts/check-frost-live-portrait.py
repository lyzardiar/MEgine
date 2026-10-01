# Author: MiYu. Compare actual native viewport pixels, independently of mesh keys.
import json
from pathlib import Path
from PIL import Image, ImageChops

root = Path(__file__).resolve().parents[1]
evidence = root / 'docs/designs/frostbound-realms'
rect = (232, 541, 360, 673)
def crop(name):
    with Image.open(evidence / (name + '.png')) as image:
        assert image.size == (1280, 720), image.size
        return image.convert('RGB').crop(rect)
idle_a, idle_b = crop('live-portrait-idle-a'), crop('live-portrait-idle-b')
pause_a, pause_b = crop('live-portrait-pause-a'), crop('live-portrait-pause-b')
pixels = ImageChops.difference(idle_a, idle_b).tobytes()
changed = sum(any(pixels[i:i+3]) for i in range(0, len(pixels), 3))
frozen = ImageChops.difference(pause_a, pause_b).getbbox() is None
assert changed > 50, f'Idle portrait did not animate: {changed} changed pixels'
assert frozen, 'Portrait changed while single-player was paused'
report = {'viewport': [1280, 720], 'portraitCrop': list(rect), 'idleChangedPixels': changed, 'pausedPixelsEqual': frozen, 'passed': True}
(evidence / 'live-portrait-pixels.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))

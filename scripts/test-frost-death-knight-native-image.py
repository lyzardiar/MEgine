"""Author: MiYu. Compare same-scene native Death Knight cloud opacity before and after the renderer repair."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/designs/frostbound-realms'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    baseline = json.loads((OUT / 'native-death-knight-assets-qa-baseline.json').read_bytes())
    current = json.loads((OUT / 'native-death-knight-assets-qa.json').read_bytes())
    assert baseline['passed'] and not baseline['visualAccepted'] and current['passed']
    assert baseline['sceneSha256'] == current['sceneSha256'] and baseline['snapshots'] == current['snapshots'] and baseline['bodyReceiptSha256'] == current['bodyReceiptSha256']
    for p in ['death-knight-effects.json', 'death-knight-effect-models.json', 'death-knight-effects-sources.json']: assert baseline['sha256'][p] == current['sha256'][p]
    assert baseline['editorSha256'] != current['editorSha256']
    assert current['rendererSourceSha256'] == sha(ROOT / 'crates/mengine-runtime/src/sampled_effects.rs')
    images = [OUT / 'death-knight-native-source-effects-baseline.png', OUT / 'death-knight-native-source-effects.png']
    before, after = [Image.open(p).convert('RGB') for p in images]; assert before.size == after.size == (1280, 960)
    regions = {}
    for name, box in [('animateCloud', (285, 250, 365, 365)), ('coilCloud', (575, 530, 660, 615))]:
        counts = [sum(all(channel > 245 for channel in pixel) for pixel in image.crop(box).get_flattened_data()) for image in [before, after]]
        assert counts[0] > 1000, (name, counts)
        assert counts[1] < counts[0] * .25, (name, counts)
        regions[name] = dict(rect=list(box), beforeWhitePixels=counts[0], afterWhitePixels=counts[1])
    # Fixed unaffected model area prevents an empty or entirely dark render from passing.
    body = (875, 250, 1010, 345)
    assert list(before.crop(body).get_flattened_data()) == list(after.crop(body).get_flattened_data()), 'Original source hero changed during the cloud comparison'
    report = dict(author='MiYu', passed=True, sceneSha256=current['sceneSha256'], editorBeforeSha256=baseline['editorSha256'], editorAfterSha256=current['editorSha256'], rendererSourceSha256=current['rendererSourceSha256'], imageSha256={p.name: sha(p) for p in images}, regions=regions, unaffectedHeroPixelsIdentical=True, scope='Same source assets, scene, selected frames and camera; native cloud rectangles no longer brighten to white. This does not establish full original Warcraft particle-solver equivalence.')
    (OUT / 'death-knight-native-image-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('PASS native Death Knight cloud opacity comparison:', json.dumps(regions))


if __name__ == '__main__': main()

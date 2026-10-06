"""Author: MiYu. Validate signed water sources, every frame/gutter and safe reproducible output."""
import importlib.util
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
spec = importlib.util.spec_from_file_location('water', ROOT / 'scripts/import-frost-water.py')
water = importlib.util.module_from_spec(spec)
spec.loader.exec_module(water)
manifest = json.loads((SAMPLE / 'classic-water-sources.json').read_bytes())
assert water.sha((ROOT / manifest['generator']).read_bytes()) == manifest['generatorSha256']
for record in manifest['sources']:
    raw = (SAMPLE / 'SourceAssets/WarcraftIII' / record['path'].replace('\\', '/')).read_bytes()
    assert len(raw) == record['bytes'] and water.sha(raw) == record['sha256']
for record in manifest['files']:
    assert water.sha((SAMPLE / record['path']).read_bytes()) == record['sha256']
atlas = Image.open(SAMPLE / manifest['texture']).convert('RGBA')
assert list(atlas.size) == manifest['atlasSize']
unique = set()
for frame in manifest['frames']:
    source = water.decode((SAMPLE / 'SourceAssets/WarcraftIII' / frame['source']).read_bytes())
    x, y, w, h = frame['atlasRect']
    assert atlas.crop((x, y, x+w, y+h)).tobytes() == source.tobytes()
    assert water.sha(source.tobytes()) == frame['pixelSha256']
    unique.add(frame['pixelSha256'])
    for gy in range(-2, 130):
        for gx in range(-2, 130):
            if gx < 0 or gx >= 128 or gy < 0 or gy >= 128:
                assert atlas.getpixel((x+gx, y+gy)) == source.getpixel((gx % 128, gy % 128))
assert len(unique) == 45
catalog = json.loads((SAMPLE / 'water-catalog.json').read_bytes())
table = water.rows((SAMPLE / 'SourceAssets/WarcraftIII/TerrainArt/Water.slk').read_bytes())
for palette in catalog['palettes']:
    assert palette['sourceRow'] == table[palette['waterID']]
    for key, value in palette['colors'].items():
        assert value == [int(palette['sourceRow'][key + '_' + channel]) / 255 for channel in 'RGBA']
with tempfile.TemporaryDirectory(prefix='frost-water-', dir=ROOT / 'tmp') as folder:
    output = pathlib.Path(folder)
    # Rebuild from packaged originals alone, without the installed game or extraction directory.
    for name in ['frames', 'table']:
        pack = output / name
        pack.mkdir()
        (pack / 'manifest.json').write_text(json.dumps(dict(files=manifest['sources'])), 'utf-8')
        for record in manifest['sources']:
            relative = record['path'].replace('\\', '/')
            target = pack / 'raw' / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SAMPLE / 'SourceAssets/WarcraftIII' / relative, target)
    command = [sys.executable, str(ROOT / manifest['generator']), '--frames', str(output / 'frames'), '--table', str(output / 'table'), '--output', str(output / 'generated')]
    subprocess.run(command, check=True)
    assert (output / 'generated/classic-water-sources.json').read_bytes() == (SAMPLE / 'classic-water-sources.json').read_bytes()
    target = output / 'generated' / manifest['texture']
    target.write_bytes(b'local edited texture')
    sentinel = output / 'generated/water-catalog.json'
    before = sentinel.read_bytes()
    result = subprocess.run(command, capture_output=True)
    assert result.returncode != 0 and b'Preserve modified water' in result.stderr
    assert target.read_bytes() == b'local edited texture' and sentinel.read_bytes() == before
print('PASS: 46 signed sources, 45 unique original frames, every wrapped gutter, 3 source color rows, exact regeneration and edited-output protection.')

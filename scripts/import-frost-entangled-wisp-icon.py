"""Author: MiYu. Import original Wisp, Unload and Cancel command portraits."""
import argparse
import importlib
import json
import pathlib

base = importlib.import_module('import-frost-entangled-assets')
ROOT, SAMPLE = base.ROOT, base.SAMPLE
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--icons', type=pathlib.Path, default=ROOT / 'tmp/entangled-wisp-icon')
parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
args = parser.parse_args(); output = args.output.resolve()
receipt_path = SAMPLE / 'entangled-wisp-icon-sources.json'
exported = (args.icons / 'manifest.json').exists()
records = json.loads((args.icons / 'manifest.json').read_bytes())['files'] if exported else json.loads(receipt_path.read_bytes())['sources']
files, sources = {}, []
for name, suffix in [('Wisp', 'wisp-icon'), ('Unload', 'unload'), ('Cancel', 'cancel')]:
    source = 'ReplaceableTextures/CommandButtons/BTN' + name + '.blp'
    record = next(r for r in records if r['path'].replace('\\', '/').lower() == source.lower())
    raw = (args.icons / 'raw' / source if exported else SAMPLE / 'SourceAssets/WarcraftIII' / source).read_bytes()
    assert len(raw) == record['bytes'] and base.sha(raw) == record['sha256']
    files['SourceAssets/WarcraftIII/' + source] = raw; files['Assets/Art/classic-' + suffix + '.png'] = base.decode_icon(raw); sources.append(record)
files['Assets/Licenses/Classic-Wisp-Icon.txt'] = b'Original Warcraft III Wisp, Unload and Cancel command portraits: Blizzard Entertainment. Original game asset terms apply. Source BLP bytes, MPQ archives and SHA-256 are retained in entangled-wisp-icon-sources.json.\n'
path = output / receipt_path.name; previous = json.loads(path.read_bytes()) if path.exists() else {}; protected = {r['path']: r for r in previous.get('files', [])}
for relative, data in files.items():
    target = output / relative
    if target.exists() and target.read_bytes() != data: assert base.sha(target.read_bytes()) == protected.get(relative, {}).get('sha256'), 'Preserve modified Wisp icon: ' + relative
report = dict(author='MiYu', generator='scripts/import-frost-entangled-wisp-icon.py', generatorSha256=base.sha(pathlib.Path(__file__).read_bytes()), decoderSha256=base.sha((ROOT / 'scripts/import-frost-entangled-assets.py').read_bytes()), sources=sources, files=[dict(path=p, bytes=len(data), sha256=base.sha(data)) for p, data in files.items()])
for relative, data in files.items():
    target = output / relative; target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or target.read_bytes() != data: target.write_bytes(data)
path.write_bytes(base.encode(report))
print('PASS original command portraits:', len(sources), 'source BLPs with archive and hash records')

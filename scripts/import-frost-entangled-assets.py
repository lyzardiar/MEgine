"""Author: MiYu. Preserve original Entangled Gold Mine model, icons and conversion provenance."""
import argparse
import hashlib
import importlib
import io
import json
import pathlib
import struct
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'


def sha(raw): return hashlib.sha256(raw).hexdigest()
def encode(value): return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode()


def decode_icon(raw):
    assert raw[:4] == b'BLP1' and struct.unpack_from('<I', raw, 4)[0] == 0
    width, height = struct.unpack_from('<2I', raw, 12)
    header, offset, size = (struct.unpack_from('<I', raw, p)[0] for p in [156, 28, 92])
    image = Image.open(io.BytesIO(raw[160:160+header] + raw[offset:offset+size]))
    image.tile = [image.tile[0]._replace(args=(image.mode, image.mode))]
    image.load()
    planes = image.split()
    alpha = planes[3] if len(planes) == 4 and struct.unpack_from('<I', raw, 8)[0] else Image.new('L', image.size, 255)
    image = Image.merge('RGBA', (planes[2], planes[1], planes[0], alpha))
    assert image.size == (width, height) == (64, 64)
    output = io.BytesIO(); image.save(output, format='PNG'); return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--icons', type=pathlib.Path, default=ROOT / 'tmp/entangled-rule-export')
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    args = parser.parse_args(); output = args.output.resolve()
    previous_path = output / 'entangled-asset-sources.json'
    previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else {}
    files, sources = {}, []
    library = ROOT / 'asset-library/warcraft-iii/game-ready'
    source = 'buildings/NightElf/EntangledGoldmine/EntangledGoldmine.mdx'
    record = next(r for r in json.loads((library / 'asset-sources.json').read_bytes())['sourceFiles'] if r['path'].replace('\\', '/').lower() == source.lower())
    raw = (library / 'SourceAssets' / pathlib.PureWindowsPath(record['path']).as_posix()).read_bytes()
    assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
    files['SourceAssets/WarcraftIII/' + pathlib.PureWindowsPath(record['path']).as_posix()] = raw
    sources.append(dict(pack='game-ready', **record))
    exported = (args.icons / 'manifest.json').exists()
    icon_records = json.loads((args.icons / 'manifest.json').read_bytes())['files'] if exported else previous['sources']
    for suffix, path in [('entangle-mine', 'ReplaceableTextures/CommandButtons/BTNEntangleMine.blp'), ('entangle-mine-disabled', 'ReplaceableTextures/CommandButtonsDisabled/DISBTNEntangleMine.blp')]:
        record = next(r for r in icon_records if r['path'].replace('\\', '/') == path)
        raw = (args.icons / 'raw' / path if exported else output / 'SourceAssets/WarcraftIII' / path).read_bytes()
        assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
        files['SourceAssets/WarcraftIII/' + path] = raw
        files['Assets/Art/classic-' + suffix + '.png'] = decode_icon(raw)
        sources.append(record)
    classic = json.loads((output / 'classic-sources.json').read_bytes())
    overlay = ROOT / classic['billboardPath']
    for name, path, expected in [('attachments', overlay, classic['billboardReceiptSha256']), ('billboards', overlay.parent / json.loads((overlay / 'asset-sources.json').read_bytes())['baseCollection'], None)]:
        raw = (path / 'asset-sources.json').read_bytes()
        if expected: assert sha(raw) == expected
        files['SourceAssets/WarcraftIII/Conversion/entangled-' + name + '.json'] = raw
    attachment = json.loads(files['SourceAssets/WarcraftIII/Conversion/entangled-attachments.json'])
    assert attachment['baseReceiptSha256'] == sha(files['SourceAssets/WarcraftIII/Conversion/entangled-billboards.json'])
    catalog = json.loads((output / 'model-catalog.json').read_bytes())['ClassicEntangledMine']
    scale = json.loads((output / 'building-scale-catalog.json').read_bytes())['models']['ClassicEntangledMine']
    assert scale['unit'] == 'egol' and len(catalog['parts']) == 9
    assert {'Birth', 'Stand', 'Death', 'Stand Work First', 'Stand Work Second', 'Stand Work Third', 'Stand Work Fourth', 'Stand Work Fifth'} <= {c['name'] for c in catalog['animations']}
    files['Assets/Licenses/Classic-Entangled-Mine.txt'] = b'Original Warcraft III Entangled Gold Mine model and command icons: Blizzard Entertainment. Original game asset terms apply. Source paths, archives, SHA-256 hashes and conversion receipts are recorded in entangled-asset-sources.json. These assets are not CC0 or MIT.\n'
    old = {r['path']: r['sha256'] for r in previous.get('files', [])}
    for path, raw in files.items():
        target = output / path
        if target.exists() and target.read_bytes() != raw: assert sha(target.read_bytes()) == old.get(path), 'Preserve modified Entangled Mine asset: ' + path
    for path, raw in files.items():
        target = output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    generator = 'scripts/import-frost-entangled-assets.py'
    report = dict(author='MiYu', generator=generator, generatorSha256=sha((ROOT / generator).read_bytes()), sources=sources, model='ClassicEntangledMine', modelScale=scale['modelScale'], classicReceiptSha256=sha((output / 'classic-sources.json').read_bytes()), files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in files.items()])
    previous_path.write_bytes(encode(report))
    print('PASS original Entangled Mine: 9 layers, original Birth and 5 work sequences, source scale, 2 original icons and retained conversion receipts')


if __name__ == '__main__': main()

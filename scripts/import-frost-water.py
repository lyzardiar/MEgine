"""Author: MiYu. Preserve the Water.slk texture sequence, colors and original frame pixels."""
import argparse
import hashlib
import io
import json
import pathlib
import re
import struct
import uuid
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'


def sha(raw): return hashlib.sha256(raw).hexdigest()


def decode(raw):
    assert raw[:4] == b'BLP1' and struct.unpack_from('<I', raw, 4)[0] == 0
    width, height = struct.unpack_from('<2I', raw, 12)
    header = struct.unpack_from('<I', raw, 156)[0]
    offset, size = struct.unpack_from('<I', raw, 28)[0], struct.unpack_from('<I', raw, 92)[0]
    image = Image.open(io.BytesIO(raw[160:160+header] + raw[offset:offset+size]))
    image.tile = [image.tile[0]._replace(args=(image.mode, image.mode))]
    image.load()
    planes = image.split()
    alpha = planes[3] if len(planes) == 4 and struct.unpack_from('<I', raw, 8)[0] else Image.new('L', image.size, 255)
    image = Image.merge('RGBA', (planes[2], planes[1], planes[0], alpha))
    assert image.size == (width, height) == (128, 128)
    return image


def rows(raw):
    cells, x, y = {}, 1, 1
    for line in raw.decode('utf-8').splitlines():
        if not line.startswith('C;'): continue
        match = re.search(r';X(\d+)', line)
        if match: x = int(match[1])
        match = re.search(r';Y(\d+)', line)
        if match: y = int(match[1])
        match = re.search(r';K(.*)$', line)
        if match: cells.setdefault(y, {})[x] = match[1].strip('"')
    header = cells.pop(1)
    return {row[1]: {header[col]: value for col, value in row.items()} for row in cells.values()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frames', type=pathlib.Path, default=ROOT / 'tmp/classic-water-export')
    parser.add_argument('--table', type=pathlib.Path, default=ROOT / 'tmp/classic-water-table-export')
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    args = parser.parse_args()
    output = args.output.resolve()
    files, sources = {}, []

    def source(pack, relative):
        receipt = json.loads((pack / 'manifest.json').read_bytes())
        record = next(r for r in receipt['files'] if r['path'].replace('\\', '/') == relative)
        raw = (pack / 'raw' / relative).read_bytes()
        assert sha(raw) == record['sha256'] and len(raw) == record['bytes'], relative
        sources.append(record)
        files['SourceAssets/WarcraftIII/' + relative] = raw
        return raw

    table = rows(source(args.table, 'TerrainArt/Water.slk'))
    palettes = []
    for name, water_id in [('Winter', 'WSha'), ('Forest', 'LSha'), ('Barrens', 'BSha')]:
        row = table[water_id]
        assert row['texFile'] == 'ReplaceableTextures\\Water\\Water' and int(row['numTex']) == 45 and int(row['texRate']) == 15 and int(row['cells']) == 2
        colors = {key: [int(row[key + '_' + channel]) / 255 for channel in 'RGBA'] for key in ['Smin', 'Smax', 'Dmin', 'Dmax']}
        palettes.append(dict(name=name, waterID=water_id, colors=colors, sourceRow=row))
    atlas = Image.new('RGBA', (1056, 792))
    frames = []
    for index in range(45):
        relative = f'ReplaceableTextures/Water/Water{index:02}.blp'
        image = decode(source(args.frames, relative))
        x, y = index % 8 * 132, index // 8 * 132
        # Wrap opposite edges into a two-pixel gutter, including all four corners.
        block = Image.new('RGBA', (132, 132))
        for gy in [-128, 0, 128]:
            for gx in [-128, 0, 128]:
                block.paste(image, (gx+2, gy+2))
        atlas.paste(block, (x, y))
        frames.append(dict(index=index, source=relative, atlasRect=[x+2, y+2, 128, 128], pixelSha256=sha(image.tobytes())))
    buffer = io.BytesIO()
    atlas.save(buffer, format='PNG')
    texture = 'Assets/Textures/Classic/water.png'
    files[texture] = buffer.getvalue()
    files[texture + '.meta'] = (json.dumps(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frost-classic-water/' + texture)), importer='texture'), separators=(',', ':')) + '\n').encode()
    catalog = dict(author='MiYu', numTex=45, texRate=15, cells=2, palettes=palettes)
    files['water-catalog.json'] = (json.dumps(catalog, separators=(',', ':')) + '\n').encode()
    files['Assets/Licenses/Classic-Water.txt'] = b'Original Warcraft III water frames and TerrainArt/Water.slk: Blizzard Entertainment. Original game asset terms and copyright remain applicable. Source archives, hashes and runtime adaptations are recorded in classic-water-sources.json.\n'
    manifest_path = output / 'classic-water-sources.json'
    previous = json.loads(manifest_path.read_bytes()) if manifest_path.exists() else {}
    old = {f['path']: f['sha256'] for f in previous.get('files', [])}
    for relative, raw in files.items():
        target = output / relative
        if target.exists() and target.read_bytes() != raw: assert old.get(relative) == sha(target.read_bytes()), 'Preserve modified water: ' + relative
    for relative, raw in files.items():
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    generator = 'scripts/import-frost-water.py'
    manifest = dict(author='MiYu', generator=generator, generatorSha256=sha((ROOT / generator).read_bytes()), sources=sources, texture=texture, atlasSize=[1056, 792], framePixels=128, gutterPixels=2, frames=frames, files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in files.items()])
    manifest_path.write_bytes((json.dumps(manifest, separators=(',', ':')) + '\n').encode())
    print('PASS exact Water.slk texture prefix: 45 original frames, 15 FPS, 3 palettes; wrapped atlas generated.')


if __name__ == '__main__': main()

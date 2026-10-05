"""Author: MiYu. Preserve Warcraft tile masks and pixels in guttered runtime atlases."""
import hashlib
import io
import json
import pathlib
import uuid
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
LIBRARY = ROOT / 'asset-library/warcraft-iii'
MASK_TILES = {15: 0, 8: 1, 4: 2, 12: 3, 2: 4, 10: 5, 6: 6, 14: 7, 1: 8, 9: 9, 5: 10, 13: 11, 3: 12, 11: 13, 7: 14}
PALETTES = {
    'soil': ['LordaeronWinter/Lordw_Dirt', 'LordaeronSummer/Lords_Dirt', 'Barrens/Barrens_Dirt'],
    'snow': ['LordaeronWinter/Lordw_Snow'] * 3,
    'grass': ['LordaeronWinter/Lordw_Grass', 'LordaeronSummer/Lords_Grass', 'Barrens/Barrens_Grass'],
    'rock': ['LordaeronWinter/Lordw_Rock', 'LordaeronSummer/Lords_Rock', 'Barrens/Barrens_Rock'],
    'road': ['Village/Village_StonePath'] * 3,
    'blight': ['Blight/Lordw_Blight', 'Blight/Lords_Blight', 'Blight/Barrens_Blight'],
}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    manifest_path = SAMPLE / 'classic-terrain-sources.json'
    previous = json.loads(manifest_path.read_text('utf-8')) if manifest_path.exists() else {}
    old = {f['path']: f['sha256'] for f in previous.get('files', [])}
    files, sources, layouts = {}, {}, []

    def save(relative, raw, kind=None):
        target = SAMPLE / relative
        if target.exists() and target.read_bytes() != raw:
            assert old.get(relative) == digest(target.read_bytes()), f'Preserve modified terrain asset: {target}'
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw:
            target.write_bytes(raw)
        files[relative] = dict(path=relative, sha256=digest(raw), bytes=len(raw))
        if kind:
            meta = dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frost-classic-terrain/' + relative)), importer=kind)
            save(relative + '.meta', (json.dumps(meta, separators=(',', ':')) + '\n').encode())

    def source(pack, relative):
        path = LIBRARY / pack / relative
        raw = path.read_bytes()
        sources[pack + '/' + relative] = dict(pack=pack, path=relative, sha256=digest(raw))
        save(relative, raw, 'texture')
        return Image.open(io.BytesIO(raw)).convert('RGBA')

    for name, paths in PALETTES.items():
        atlas = Image.new('RGBA', (544, 816))
        slots = []
        for palette, path in enumerate(paths):
            relative = 'Assets/WarcraftIII/Textures/TerrainArt/' + path + '.png'
            image = source('game-ready', relative)
            assert image.size in [(256, 256), (512, 256)], (relative, image.size)
            for slot in range(32):
                tile_index = MASK_TILES.get(slot) if slot < 16 else None
                if slot == 0:
                    tile = Image.new('RGBA', (64, 64))
                    rect = None
                else:
                    x, y = ((tile_index % 4) * 64, (tile_index // 4) * 64) if slot < 16 else ((4 + (slot - 16) % 4) * 64, ((slot - 16) // 4) * 64) if image.width == 512 else (0, 0)
                    rect = [x, y, 64, 64]
                    tile = image.crop((x, y, x + 64, y + 64))
                    if slot < 16:
                        corners = [tile.getchannel('A').crop((cx, cy, cx + 8, cy + 8)) for cx, cy in [(0, 0), (56, 0), (0, 56), (56, 56)]]
                        mask = sum(1 << i for i, corner in enumerate(corners) if sum(corner.get_flattened_data()) / 64 > 127.5)
                        assert mask == slot, (relative, slot, mask)
                padded = Image.new('RGBA', (68, 68))
                padded.paste(tile, (2, 2))
                for side, box in [('left', (0, 0, 1, 64)), ('right', (63, 0, 64, 64)), ('top', (0, 0, 64, 1)), ('bottom', (0, 63, 64, 64))]:
                    padded.paste(tile.crop(box).resize((2, 64) if side in ['left', 'right'] else (64, 2), Image.Resampling.NEAREST), {'left': (0, 2), 'right': (66, 2), 'top': (2, 0), 'bottom': (2, 66)}[side])
                for cx, cy in [(0, 0), (1, 0), (0, 1), (1, 1)]:
                    padded.paste(tile.getpixel((cx * 63, cy * 63)), (cx * 66, cy * 66, cx * 66 + 2, cy * 66 + 2))
                column, row = slot % 8, palette * 4 + slot // 8
                atlas.paste(padded, (column * 68, row * 68))
                slots.append(dict(palette=palette, slot=slot, source=relative, sourceRect=rect, atlasRect=[column * 68 + 2, row * 68 + 2, 64, 64]))
        output = io.BytesIO()
        atlas.save(output, format='PNG', optimize=True)
        relative = 'Assets/Textures/Classic/tiles-' + name + '.png'
        save(relative, output.getvalue(), 'texture')
        layouts.append(dict(layer=name, texture=relative, width=544, height=816, slots=slots))

    manifest = dict(version=1, tilePixels=64, gutterPixels=2, tileWorldSize=2, palettes=['Winter', 'Forest', 'Barrens'], cornerBits=['NW', 'NE', 'SW', 'SE'], maskTiles=MASK_TILES, layers=layouts, sources=list(sources.values()), files=list(files.values()), tool=dict(path='scripts/import-frost-classic-terrain.py', sha256=digest(pathlib.Path(__file__).read_bytes())), attribution='Blizzard Entertainment; original Warcraft III asset terms remain applicable.')
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf-8')
    print(f'Classic terrain: {len(sources)} source atlases, {len(layouts)} runtime atlases, {len(files)} files; pixels and corner masks verified.')


if __name__ == '__main__':
    main()

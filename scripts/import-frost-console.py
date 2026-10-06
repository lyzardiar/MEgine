"""Author: MiYu. Compose original Warcraft console frame definitions and textures for the native HUD."""
import argparse
import hashlib
import io
import json
import pathlib
import struct
import re
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
RACES = [('human', 'Human'), ('orc', 'Orc'), ('night-elf', 'NightElf'), ('undead', 'Undead')]


def sha(raw): return hashlib.sha256(raw).hexdigest()


def decode_texture(raw):
    assert raw[:4] == b'BLP1' and struct.unpack_from('<I', raw, 4)[0] == 1
    flags, width, height = struct.unpack_from('<3I', raw, 8); assert flags == 8
    offset = struct.unpack_from('<I', raw, 28)[0]; count = width*height
    palette = np.frombuffer(raw, dtype=np.uint8, count=1024, offset=156).reshape(256, 4)
    indices = np.frombuffer(raw, dtype=np.uint8, count=count, offset=offset)
    pixels = palette[indices][:, [2, 1, 0, 3]].copy(); pixels[:, 3] = np.frombuffer(raw, dtype=np.uint8, count=count, offset=offset+count)
    return pixels.reshape(height, width, 4)


def png(image):
    output = io.BytesIO(); image.save(output, format='PNG'); return output.getvalue()


def raster(frame, race, read, name, files):
    canvas = Image.new('RGBA', (1280, 720))
    blocks = re.findall(r'Texture\s*\{([^}]+)\}', frame)
    assert len(blocks) == 9
    layout = []
    for index, block in enumerate(blocks):
        tile = re.search(r'File "ConsoleTexture(\d+)"', block).group(1)
        width = float(re.search(r'Width ([\d.]+)', block).group(1)); height = float(re.search(r'Height ([\d.]+)', block).group(1))
        uv = [float(v) for v in re.search(r'TexCoord ([^,]+), ([^,]+), ([^,]+), ([^,]+),', block).groups()]
        anchor, dx, dy = re.search(r'Anchor (\w+),\s*([\d.\-]+),\s*([\d.\-]+),', block).groups(); dx = float(dx); dy = float(dy)
        x = dx if anchor.endswith('LEFT') else .8+dx-width; y = -dy if anchor.startswith('TOP') else .6-dy-height
        image = Image.fromarray(decode_texture(read('UI/Console/'+race+'/'+race+'UITile'+tile+'.blp')))
        crop = image.crop((round(uv[0]*image.width), round(uv[2]*image.height), round(uv[1]*image.width), round(uv[3]*image.height)))
        crop = crop.resize((round(width*1600), round(height*1200)), Image.Resampling.LANCZOS); canvas.alpha_composite(crop, (round(x*1600), round(y*1200)))
        files['Assets/Art/console-'+name+'-'+str(index)+'.png'] = png(crop)
        layout.append(dict(anchor=[0 if anchor.endswith('LEFT') else 1, 0 if anchor.startswith('TOP') else 1], position=[(dx+(width/2 if anchor.endswith('LEFT') else -width/2))*1600, (-dy+(height/2 if anchor.startswith('TOP') else -height/2))*1200], size=[width*1600, height*1200]))
    return png(canvas), layout


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--output', type=pathlib.Path, default=ROOT/'samples/frostbound-realms'); args = parser.parse_args(); output = args.output.resolve()
    library = ROOT/'asset-library/warcraft-iii/remaining-ready'; receipt = json.loads((library/'asset-sources.json').read_bytes()); originals = {f['path'].replace('\\', '/').lower(): f for f in receipt['sourceFiles']}; files, inputs = {}, {}
    def read(relative):
        record = originals[relative.replace('\\', '/').lower()]; raw = (library/'SourceAssets'/pathlib.Path(record['path'].replace('\\', '/'))).read_bytes(); assert sha(raw) == record['sha256'], relative
        path = 'SourceAssets/WarcraftIII/'+record['path'].replace('\\', '/'); files[path] = raw; inputs[path] = record['sha256']; return raw
    frame_receipt = (ROOT/'samples/frostbound-realms/console-frame-sources.json').read_bytes()
    for record in json.loads(frame_receipt)['files']:
        path = 'SourceAssets/WarcraftIII/'+record['path'].replace('\\', '/'); raw = (ROOT/'samples/frostbound-realms'/path).read_bytes(); assert sha(raw) == record['sha256']; files[path] = raw
    frame = files['SourceAssets/WarcraftIII/UI/FrameDef/UI/ConsoleUI.fdf'].decode('utf-8')
    for name, race in RACES:
        files['Assets/Art/console-'+name+'.png'], layout = raster(frame, race, read, name, files)
        for label, suffix in [('clock', 'TimeIndicatorFrame'), ('cover', 'InventoryCover')]:
            files['Assets/Art/console-'+name+'-'+label+'.png'] = png(Image.fromarray(decode_texture(read('UI/Console/'+race+'/'+race+'UITile-'+suffix+'.blp'))))
        path = 'SourceAssets/WarcraftIII/UI/Widgets/Console/'+race+'/'+race.lower()+'-console-buttonstates2.blp'; image = Image.fromarray(decode_texture(files[path]))
        for label, y in [('normal', 0), ('pressed', 64), ('disabled', 128), ('highlight', 192)]: files['Assets/Art/console-'+name+'-button-'+label+'.png'] = png(image.crop((0, y, 170, y+44)))
    files['console-layout.json'] = (json.dumps(dict(author='MiYu', pieces=layout), separators=(',', ':'))+'\n').encode()
    for label in ['Gold', 'Lumber', 'Supply']: files['Assets/Art/console-'+label.lower()+'.png'] = png(Image.fromarray(decode_texture(files['SourceAssets/WarcraftIII/UI/Feedback/Resources/Resource'+label+'.blp'])))
    path = output/'console-sources.json'; old = {f['path']: f['sha256'] for f in json.loads(path.read_bytes())['files']} if path.exists() else {}
    for relative, raw in files.items():
        target = output/relative
        if target.exists() and target.read_bytes() != raw: assert sha(target.read_bytes()) == old.get(relative), 'Preserve modified console: '+relative
    for relative, raw in files.items():
        target = output/relative; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    generator = 'scripts/import-frost-console.py'; result = dict(author='MiYu', generator=generator, generatorSha256=sha((ROOT/generator).read_bytes()), sourceReceiptSha256=sha((library/'asset-sources.json').read_bytes()), sourceFiles=inputs, frameReceiptSha256=sha(frame_receipt), projection=dict(source=[.8, .6], output=[1280, 720]), files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in files.items()])
    path.write_bytes((json.dumps(result, ensure_ascii=False, separators=(',', ':'))+'\n').encode()); print('PASS original console frame definitions:', len(RACES), 'races;', len(inputs), 'signed sources')


if __name__ == '__main__': main()

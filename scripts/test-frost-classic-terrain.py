"""Author: MiYu. Check original tile pixels, gutters and native material/shader loading."""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', type=pathlib.Path, required=True)
    args = parser.parse_args()
    manifest = json.loads((SAMPLE / 'classic-terrain-sources.json').read_text('utf-8'))
    assert hashlib.sha256((ROOT / manifest['tool']['path']).read_bytes()).hexdigest() == manifest['tool']['sha256']
    for entry in manifest['files']:
        assert hashlib.sha256((SAMPLE / entry['path']).read_bytes()).hexdigest() == entry['sha256'], entry['path']
    for entry in manifest['sources']:
        source = ROOT / 'asset-library/warcraft-iii' / entry['pack'] / entry['path']
        assert hashlib.sha256(source.read_bytes()).hexdigest() == entry['sha256'], entry['path']
    tiles = 0
    for layer in manifest['layers']:
        atlas = Image.open(SAMPLE / layer['texture']).convert('RGBA')
        for slot in layer['slots']:
            x, y, w, h = slot['atlasRect']
            tile = atlas.crop((x, y, x + w, y + h))
            if slot['sourceRect']:
                sx, sy, sw, sh = slot['sourceRect']
                source = Image.open(SAMPLE / slot['source']).convert('RGBA').crop((sx, sy, sx + sw, sy + sh))
                assert tile.tobytes() == source.tobytes(), (layer['layer'], slot)
            else:
                assert tile.getchannel('A').getextrema() == (0, 0)
            for edge in range(64):
                for distance in [1, 2]:
                    assert atlas.getpixel((x-distance, y+edge)) == tile.getpixel((0, edge))
                    assert atlas.getpixel((x+63+distance, y+edge)) == tile.getpixel((63, edge))
                    assert atlas.getpixel((x+edge, y-distance)) == tile.getpixel((edge, 0))
                    assert atlas.getpixel((x+edge, y+63+distance)) == tile.getpixel((edge, 63))
            tiles += 1

    output = ROOT / 'tmp/classic-terrain-validation'
    output.mkdir(parents=True, exist_ok=True)
    required = set()
    for name in ['Ground', 'GroundIce', 'GroundMasonry']:
        material_path = 'Assets/Materials/' + name + '.mmat'
        material = json.loads((SAMPLE / material_path).read_text('utf-8'))
        required.update([material_path, material['custom_shader']])
        required.update(v for k, v in material.items() if k.endswith('_texture') and isinstance(v, str))
        shader = (SAMPLE / material['custom_shader']).read_text('utf-8')
        schema = json.loads(re.search(r'/\* MENGINE_PARAMETERS\s*(.*?)\s*\*/', shader, re.S).group(1))
        required.update(t['default'] for t in schema['textures'])
    for relative in sorted(required):
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SAMPLE / relative, target)
    scene = json.loads((SAMPLE / 'Assets/Scenes/Main.mscene').read_text('utf-8'))
    scene['world']['entities'] = [e for e in scene['world']['entities'] if e['name'] == 'Ground 0']
    assert len(scene['world']['entities']) == 1
    entity = scene['world']['entities'][0]
    entities = []
    for index, name in enumerate(['Ground', 'GroundIce', 'GroundMasonry']):
        clone = json.loads(json.dumps(entity));clone['entity'] = index + 1;clone['name'] = name
        clone['components']['MeshRenderer']['material'] = 'Assets/Materials/' + name + '.mmat'
        entities.append(clone)
    scene['world']['entities'] = entities
    (output / 'Terrain.mscene').write_text(json.dumps(scene), 'utf-8')
    paths = [output / p for p in sorted(required)] + [output / 'Terrain.mscene']
    files = [dict(path=p.relative_to(output).as_posix(), size=p.stat().st_size, sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in paths]
    (output / 'mengine-build.json').write_text(json.dumps(dict(schemaVersion=1, files=files)), 'utf-8')
    run = subprocess.run([str(args.runtime), '--validate-package', '--project-root', str(output), '--scene', 'Terrain.mscene'], capture_output=True, encoding='utf-8', errors='replace')
    print(run.stdout, run.stderr)
    assert run.returncode == 0, 'Native terrain shader/material validation failed'
    print(f'PASS classic terrain: {len(manifest["files"])} file hashes, {tiles} original pixel tiles, gutters and three native materials.')


if __name__ == '__main__':
    main()

"""Author: MiYu. Export an original map, its decoded geometry, and reproducible source receipts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
from warcraft_map import load_map

ROOT = Path(__file__).resolve().parents[1]


def export_map(source, output):
    data, members = load_map(source)
    output = Path(output).resolve()
    if output.exists():
        raise FileExistsError(f'Preserve existing output: {output}')
    raw = Path(source).read_bytes()
    if hashlib.sha256(raw).hexdigest() != data['source']['sha256']:
        raise ValueError('Source map changed during import')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='.warcraft-map-', dir=output.parent))
    try:
        sources = temporary / 'source'
        sources.mkdir()
        original_name = 'original' + Path(source).suffix.lower()
        (sources / original_name).write_bytes(raw)
        data['source']['preservedArchive'] = 'source/' + original_name
        for name, member in members.items():
            (sources / name).write_bytes(member)
            data['source']['members'][name]['preservedFile'] = 'source/' + name
        data['importer'] = dict(path='scripts/import-frost-original-map.py', sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                                readerSha256=hashlib.sha256((ROOT / 'scripts/warcraft_map.py').read_bytes()).hexdigest(),
                                formatReference='https://github.com/flowtsohg/mdx-m3-viewer/tree/2ff0bc00c6363f425016e23d88c0fb2929d3b3cc/src/parsers/w3x')
        (temporary / 'map.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
        # Publish only a complete export; never merge into a pre-existing directory.
        os.rename(temporary, output)
    finally:
        if temporary.exists():
            temporary.resolve().relative_to(output.parent)
            shutil.rmtree(temporary)
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Original .w3m/.w3x; read-only input')
    parser.add_argument('--output', type=Path, help='New output directory; defaults to tmp/docs-artifacts/frost-original-maps/<map name>')
    args = parser.parse_args()
    output = args.output or ROOT / 'tmp/docs-artifacts/frost-original-maps' / args.source.stem
    data = export_map(args.source, output)
    print(json.dumps(dict(name=data['name'], output=str(output.resolve()), terrainTiles=data['terrain']['tileSize'], pathingCells=data['pathing']['size'],
                          players=len(data['info']['players']), sourceSha256=data['source']['sha256'], diagnostics=data['diagnostics'], runtimePlayable=False), ensure_ascii=False))


if __name__ == '__main__':
    main()

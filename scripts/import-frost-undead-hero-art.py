"""Author: MiYu. Reproduce original Undead hero art and complete Crypt Lord attachment locators."""
import argparse
import importlib
import json
from pathlib import Path
import subprocess


def extend_crypt_lord():
    base = importlib.import_module('import-frost-orc-hero-art')
    extension = importlib.import_module('convert-frost-classic-attachments')
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--output', type=Path, default=base.SAMPLE)
    args, _ = parser.parse_known_args(); output = args.output.resolve()
    receipt_path = output / 'undead-hero-art-sources.json'; receipt = json.loads(receipt_path.read_bytes())
    reader = base.ROOT / 'tmp/warcraft-effects/attachment-metadata/AttachmentMetadata.dll'
    metadata_path = output / 'SourceAssets/UndeadHeroes/art/nodes/ClassicCryptLord.json'
    metadata = json.loads(metadata_path.read_bytes())
    binding = next(b for b in receipt['bindings'] if b['key'] == 'ClassicCryptLord')
    source = next(s for s in receipt['sources'] if s['path'] == binding['path'])
    import tempfile
    with tempfile.TemporaryDirectory(prefix='crypt-lord-locators-', dir=base.ROOT / 'tmp') as temporary:
        target = Path(temporary) / 'attachments.json'
        subprocess.run(['dotnet', str(reader), str(output / source['output']), str(target)], check=True, capture_output=True)
        definitions = json.loads(target.read_bytes())['attachments']
    model = json.loads((output / 'undead-hero-models.json').read_bytes())['ClassicCryptLord']
    generated = {metadata_path: base.encode(dict(metadata, attachments=definitions))}
    for part in model['parts']:
        path = output / part['mesh']; generated[path] = extension.extend(path.read_bytes(), metadata, definitions, part['geoset'])
    for path, raw in generated.items():
        record = next(r for r in receipt['outputs'] if r['path'] == path.relative_to(output).as_posix())
        record.update(bytes=len(raw), sha256=base.sha(raw))
    receipt['generators'] += [dict(path=p, sha256=base.sha((base.ROOT / p).read_bytes().replace(b'\r\n', b'\n'))) for p in extension.SOURCES]
    signed_binaries = {r['path'] for r in receipt['binaries']}
    for path in [reader, reader.with_name('Wc3ModelViewer.Core.dll'), reader.with_suffix('.deps.json'), reader.with_suffix('.runtimeconfig.json')]:
        relative = path.relative_to(base.ROOT).as_posix()
        if relative not in signed_binaries: receipt['binaries'].append(dict(path=relative, bytes=path.stat().st_size, sha256=base.sha(path.read_bytes())))
    for path, raw in generated.items(): path.write_bytes(raw)
    receipt_path.write_bytes(base.encode(receipt))
    print('PASS original Crypt Lord locators:', len(metadata['nodes']), 'source nodes,', len(definitions), 'attachment locators,', len(model['parts']), 'render parts')


if __name__ == '__main__':
    importlib.import_module('import-frost-orc-hero-art').main({'description': __doc__, 'race': 'Undead', 'sourceDescription': 'Bundled original Warcraft III Undead hero sources', 'bindings': [('Udea', 'ClassicDeathKnight', 'Units/Undead/HeroDeathKnight/HeroDeathKnight'), ('Ulic', 'ClassicLich', 'Units/Undead/HeroLich/HeroLich'), ('Udre', 'ClassicDreadLord', 'Units/Undead/HeroDreadLord/HeroDreadLord'), ('Ucrl', 'ClassicCryptLord', 'Units/Undead/HeroCryptLord/HeroCryptLord')], 'receipt': 'undead-hero-art-sources.json', 'prefix': 'Assets/UndeadHeroes/', 'raw': 'SourceAssets/UndeadHeroes/art/', 'modelsFile': 'undead-hero-models.json', 'portraitsFile': 'undead-hero-portraits.json', 'sourceLicenseFile': 'Assets/Licenses/Classic-Undead-Hero-Art.txt', 'licenseFile': 'Assets/Licenses/Undead-Hero-W3ModelViewer-MIT.txt', 'generators': ['scripts/import-frost-undead-hero-art.py']})
    extend_crypt_lord()

"""Author: MiYu. Reproduce Frozen Throne geometry, materials and source node billboards."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
BINDING = dict(key='ClassicFrozenThrone', source='FrozenThrone', pack='remaining-ready', model='Doodads\\Cinematic\\FrozenThrone\\FrozenThrone.mdx', building=True)


def sha(raw): return hashlib.sha256(raw).hexdigest()
def encode(value): return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--pose-probe', type=pathlib.Path, required=True)
    parser.add_argument('--metadata-reader', type=pathlib.Path, required=True)
    args = parser.parse_args(); output = args.output.resolve(); files = {}
    with tempfile.TemporaryDirectory(prefix='frost-moba-') as temporary:
        work = pathlib.Path(temporary); geometry = work / 'geometry'; geometry.mkdir()
        (geometry / 'model-catalog.json').write_bytes(encode({}))
        bindings = work / 'bindings.json'; bindings.write_bytes(encode(dict(models=[BINDING])))
        overlay = work / 'overlay'
        def run(script, *params): subprocess.run([sys.executable, str(ROOT / 'scripts' / script), *map(str, params)], check=True)
        run('convert-frost-classic-billboards.py', '--bindings', bindings, '--output', overlay, '--metadata-reader', args.metadata_reader)
        run('import-frost-classic.py', '--output', geometry, '--keys', BINDING['key'], '--bindings', bindings, '--billboard-library', overlay, '--pose-probe', args.pose_probe)
        receipt = json.loads((geometry / 'classic-sources.json').read_bytes())
        for record in receipt['files']:
            raw = (geometry / record['path']).read_bytes(); assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
            files[record['path']] = raw
        for relative in files:
            if relative.startswith('Assets/') and relative.endswith(('.png', '.glb', '.mmat')):
                assert relative + '.meta' in files, 'Missing source asset metadata: ' + relative
        files['moba-models.json'] = (geometry / 'model-catalog.json').read_bytes()
        files['SourceAssets/Moba/node-conversion.json'] = (overlay / 'asset-sources.json').read_bytes()
        library = ROOT / 'asset-library/warcraft-iii/remaining-ready'
        original = json.loads((library / 'asset-sources.json').read_bytes())
        source = next(r for r in original['sourceFiles'] if r['path'].replace('\\', '/').lower() == BINDING['model'].replace('\\', '/').lower())
        relative = source['path'].replace('\\', '/'); raw = (library / 'SourceAssets' / relative).read_bytes()
        assert sha(raw) == source['sha256'] and len(raw) == source['bytes']; files['SourceAssets/WarcraftIII/' + relative] = raw
        files['Assets/Licenses/warcraft-moba.txt'] = b'Frozen Throne model and textures: Blizzard Entertainment, Warcraft III. Source package: asset-library/warcraft-iii/remaining-ready. These game assets are not CC0 or MIT. Conversion attribution and signed sources are recorded in moba-model-sources.json and SourceAssets/Moba/node-conversion.json.\n'
        for name in ['W3ModelViewer-MIT.txt', 'converter-sources.json']:
            files['SourceAssets/Moba/Licenses/' + name] = (overlay / 'Licenses/remaining-ready' / name).read_bytes()
        tools = ['scripts/import-frost-moba-art.py', 'scripts/import-frost-classic.py', 'scripts/convert-frost-classic-billboards.py']
        report = dict(author='MiYu', generators={p: sha((ROOT / p).read_bytes().replace(b'\r\n', b'\n')) for p in tools}, sourceCollectionSha256=sha((library / 'asset-sources.json').read_bytes()), poseProbeSha256=sha(args.pose_probe.read_bytes()), sources=[source], files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    previous_path = output / 'moba-model-sources.json'; previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else {}
    old = {r['path']: r['sha256'] for r in previous.get('files', [])}
    for p, raw in files.items():
        target = output / p
        assert not target.exists() or target.read_bytes() == raw or sha(target.read_bytes()) == old.get(p), 'Preserve modified MOBA asset: ' + p
    for p, raw in files.items():
        target = output / p; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    previous_path.write_bytes(encode(report))
    print('PASS Frozen Throne import:', len(files), 'signed outputs')


if __name__ == '__main__': main()

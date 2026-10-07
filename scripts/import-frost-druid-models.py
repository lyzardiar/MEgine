"""Author: MiYu. Import signed Druid/Ancient meshes without changing the shared asset library."""
import argparse
import json
import pathlib
import subprocess
import sys
import tempfile
from importlib import import_module

base = import_module('import-frost-druids')
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode
BINDINGS = [('ClassicDruidTalon', 'DruidoftheTalon', 'Units\\NightElf\\DruidOfTheTalon\\DruidoftheTalon.mdx'), ('ClassicAncientLore', 'AncientofLore', 'Buildings\\NightElf\\AncientofLore\\AncientofLore.mdx'), ('ClassicAncientWind', 'AncientofWind', 'Buildings\\NightElf\\AncientofWind\\AncientofWind.mdx')]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--pose-probe', type=pathlib.Path, required=True)
    parser.add_argument('--metadata-reader', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    args = parser.parse_args(); output = args.output.resolve(); files = {}
    with tempfile.TemporaryDirectory(prefix='frost-druids-') as temp:
        work = pathlib.Path(temp); geometry = work / 'geometry'; geometry.mkdir()
        (geometry / 'model-catalog.json').write_bytes(encode({}))
        bindings = work / 'bindings.json'; bindings.write_bytes(encode(dict(models=[dict(key=k, source=s, pack='game-ready', model=m) for k, s, m in BINDINGS])))
        overlay = work / 'overlay'
        def run(script, *params): subprocess.run([sys.executable, str(ROOT / 'scripts' / script), *map(str, params)], check=True)
        run('convert-frost-classic-billboards.py', '--bindings', bindings, '--output', overlay, '--metadata-reader', args.metadata_reader)
        run('import-frost-classic.py', '--output', geometry, '--keys', *[k for k, _, _ in BINDINGS], '--billboard-library', overlay, '--pose-probe', args.pose_probe)
        receipt = json.loads((geometry / 'classic-sources.json').read_bytes())
        for record in receipt['files']:
            raw = (geometry / record['path']).read_bytes(); assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
            files[record['path']] = raw
        files['druid-models.json'] = (geometry / 'model-catalog.json').read_bytes()
        files['SourceAssets/Druids/node-conversion.json'] = (overlay / 'asset-sources.json').read_bytes()
        library = ROOT / 'asset-library/warcraft-iii/game-ready'
        original = json.loads((library / 'asset-sources.json').read_bytes()); signed = {r['path'].replace('\\', '/').lower(): r for r in original['sourceFiles']}
        sources = []
        for _, _, model in BINDINGS:
            record = signed[model.replace('\\', '/').lower()]; p = record['path'].replace('\\', '/'); raw = (library / 'SourceAssets' / p).read_bytes()
            assert sha(raw) == record['sha256'] and len(raw) == record['bytes']; files['SourceAssets/WarcraftIII/' + p] = raw; sources.append(record)
        tools = ['scripts/import-frost-druid-models.py', 'scripts/import-frost-classic.py', 'scripts/convert-frost-classic-billboards.py']
        report = dict(author='MiYu', generators={p: sha((ROOT / p).read_bytes()) for p in tools}, sourceCollectionSha256=sha((library / 'asset-sources.json').read_bytes()), poseProbeSha256=sha(args.pose_probe.read_bytes()), sources=sources, files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    previous_path = output / 'druid-model-sources.json'; previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else {}
    old = {r['path']: r['sha256'] for r in previous.get('files', [])}
    for p, raw in files.items():
        target = output / p
        assert not target.exists() or target.read_bytes() == raw or sha(target.read_bytes()) == old.get(p), 'Preserve modified Druid mesh: ' + p
    for p, raw in files.items():
        target = output / p; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    previous_path.write_bytes(encode(report))
    print('PASS original Druid models:', len(files), 'signed outputs')


if __name__ == '__main__': main()

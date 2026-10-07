"""Author: MiYu. Import signed original Sentinel Owl geometry, node animation and sampled particles."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
SOURCE = 'Units/NightElf/Owl/Owl.mdx'

def sha(raw): return hashlib.sha256(raw).hexdigest()
def encode(value): return (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
def load(path): return json.loads(path.read_bytes())

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--pose-probe', type=pathlib.Path, required=True)
    parser.add_argument('--metadata-reader', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    parser.add_argument('--sampler', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/sentinel-bin/MdxExport.dll')
    args = parser.parse_args(); output = args.output.resolve()
    files = {}
    def verified(directory, records):
        for record in records:
            raw = (directory / record['path']).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Modified Sentinel conversion: ' + record['path']
            if record['path'] in files: assert files[record['path']] == raw, 'Conflicting Sentinel dependency: ' + record['path']
            files[record['path']] = raw
    def run(script, *arguments):
        subprocess.run([sys.executable, str(ROOT / 'scripts' / script), *map(str, arguments)], cwd=ROOT, check=True)
    library = ROOT / 'asset-library/warcraft-iii/remaining-ready'
    source_receipt = load(library / 'asset-sources.json')
    source = next(r for r in source_receipt['sourceFiles'] if pathlib.PureWindowsPath(r['path']).as_posix().lower() == SOURCE.lower())
    raw = (library / 'SourceAssets' / SOURCE).read_bytes()
    assert sha(raw) == source['sha256'] and len(raw) == source['bytes'], 'Modified original Sentinel Owl'
    files['SourceAssets/WarcraftIII/' + SOURCE] = raw
    with tempfile.TemporaryDirectory(prefix='sentinel-import-', dir=ROOT / 'tmp') as scratch:
        stage = pathlib.Path(scratch); geometry, effects, overlay = [stage / name for name in ['geometry', 'effects', 'overlay']]
        geometry.mkdir(); (geometry / 'model-catalog.json').write_bytes(encode({}))
        bindings = stage / 'bindings.json'; bindings.write_bytes(encode(dict(models=[dict(pack='remaining-ready', model=SOURCE)])))
        run('convert-frost-classic-billboards.py', '--metadata-reader', args.metadata_reader, '--bindings', bindings, '--output', overlay)
        run('import-frost-classic.py', '--pose-probe', args.pose_probe, '--billboard-library', overlay, '--output', geometry, '--keys', 'ClassicSentinelOwl')
        run('convert-warcraft-effects.py', '--sampler', args.sampler, '--source', 'remaining-ready/' + SOURCE, '--output', effects)
        mesh_receipt, effect_receipt = load(geometry / 'classic-sources.json'), load(effects / 'asset-sources.json')
        verified(geometry, mesh_receipt['files'])
        verified(effects, [r for r in effect_receipt['generatedFiles'] if not r['path'].lower().startswith('assets/warcraftiii/effect-catalog.json')])
        model = load(geometry / 'model-catalog.json')['ClassicSentinelOwl']
        effect = load(effects / 'Assets/WarcraftIII/effect-catalog.json')['models'][0]
        assert effect['particles'] == 2 and len(model['parts']) == 3 and pathlib.PureWindowsPath(model['sourceModel']).as_posix().lower() == SOURCE.lower()
        files['sentinel-catalog.json'] = encode(dict(author='MiYu', model=model, effect=effect['effect'], particles=effect['particles'], sourceUnitsPerModelUnit=128))
        files['SourceAssets/Sentinel/node-conversion.json'] = (overlay / 'asset-sources.json').read_bytes()
        files['SourceAssets/Sentinel/effect-conversion.json'] = (effects / 'asset-sources.json').read_bytes()
        source_files = [source]
        references = {r['source'].replace('\\', '/').lower() for r in effect_receipt['textureSources'].values()}
        references.update(t['fileName'].replace('\\', '/').lower() for t in load(effects / effect['effect'])['sourceModel']['textures'] if t.get('fileName'))
        references.add('replaceabletextures/teamcolor/teamcolor00.blp')
        # Record original texture bytes as well as the signed converted PNG dependencies.
        for record in source_receipt['sourceFiles']:
            relative = pathlib.PureWindowsPath(record['path']).as_posix()
            if relative.lower() not in references: continue
            data = (library / 'SourceAssets' / relative).read_bytes()
            assert sha(data) == record['sha256'] and len(data) == record['bytes'], relative
            files['SourceAssets/WarcraftIII/' + relative] = data; source_files.append(record)
        provenance = dict(sourceCollectionSha256=sha((library / 'asset-sources.json').read_bytes()), sources=source_files, nodeConverter=load(overlay / 'asset-sources.json')['converter'], effectConverter=effect_receipt['converter'], poseProbeSha256=sha(args.pose_probe.read_bytes()))
    files['Assets/Licenses/Classic-Sentinel.txt'] = b'Original Warcraft III Sentinel Owl model and textures: Blizzard Entertainment. Original game asset terms apply. Sampled particles approximate the viewer solver. Original and converted hashes are recorded in sentinel-sources.json.\n'
    receipt_path = output / 'sentinel-sources.json'
    protected = {r['path']: r['sha256'] for r in load(receipt_path).get('files', [])} if receipt_path.exists() else {}
    for relative, raw in files.items():
        path = output / relative
        assert not path.exists() or path.read_bytes() == raw or sha(path.read_bytes()) == protected.get(relative), 'Preserve modified Sentinel asset: ' + relative
    report = dict(author='MiYu', generator='scripts/import-frost-sentinel.py', generatorSha256=sha(pathlib.Path(__file__).read_bytes()), **provenance, files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    for relative, raw in files.items():
        path = output / relative; path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.read_bytes() != raw: path.write_bytes(raw)
    receipt_path.write_bytes(encode(report))
    print('PASS original Sentinel Owl:', len(files), 'signed outputs; three animated parts and two particle emitters')

if __name__ == '__main__': main()

"""Author: MiYu. Reproduce original War Mill and Graveyard lumber depot rules, icons and models."""
import argparse
import hashlib
import importlib
import io
import json
import pathlib
import sys
import tempfile
import uuid
from PIL import Image
from warcraft_mpq import mpyq, read_archive

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-human-army').section
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
BINDINGS = [dict(key='ClassicWarMillDepot', source='WarMill', pack='game-ready', model='buildings/Orc/WarMill/WarMill.mdx', building=True), dict(key='ClassicGraveyardDepot', source='Graveyard', pack='game-ready', model='buildings/Undead/Graveyard/Graveyard.mdx', building=True)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--source-sample', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--library', type=pathlib.Path, default=ROOT / 'asset-library/warcraft-iii')
    parser.add_argument('--pose-probe', type=pathlib.Path, required=True)
    parser.add_argument('--metadata-reader', type=pathlib.Path, required=True)
    args = parser.parse_args(); output = args.output.resolve()
    receipt_name = 'lumber-depot-sources.json'; source_root = 'SourceAssets/LumberDepots/'
    retained_path = args.source_sample / receipt_name
    retained = json.loads(retained_path.read_bytes()) if retained_path.exists() else {}
    previous_path = output / receipt_name
    previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else {}
    files, sources, archives = {}, {}, []
    for record in previous.get('files', []):
        raw = (output / record['path']).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Preserve edited output: ' + record['path']

    def original(path):
        if path in sources: return files[source_root + path]
        record = next((r for r in retained.get('sources', []) if r['path'] == path), None)
        if record:
            raw = (args.source_sample / source_root / path).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Corrupt retained source: ' + path
        else:
            assert not retained, 'Missing retained source: ' + path
            if not archives: archives.extend((name, mpyq.MPQArchive(str(args.game / name), listfile=False)) for name in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original lumber depot source: ' + path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        shared = args.source_sample / 'SourceAssets/WarcraftIII' / path
        if shared.exists(): assert shared.read_bytes() == raw, 'Shared original differs from MPQ source: ' + path
        sources[path] = record; files[source_root + path] = raw
        return raw

    tables = {name: rows(original('Units/' + name + '.slk')) for name in ['UnitBalance', 'UnitWeapons', 'UnitUI', 'UnitAbilities']}
    buildings = {}
    for kind, source, race, label, model in [('warmill', 'ofor', 'Orc', 'War Mill', 'ClassicWarMillDepot'), ('graveyard', 'ugrv', 'Undead', 'Graveyard', 'ClassicGraveyardDepot')]:
        balance, ui = tables['UnitBalance'][source], tables['UnitUI'][source]
        func = section(original('Units/' + race + 'UnitFunc.txt'), source)
        strings = section(original('Units/' + race + 'UnitStrings.txt'), source)
        assert balance['defType'] == 'fort'
        d = dict(sourceUnit=source, label=label, model=model, hp=int(balance['HP']), armor='fortified', armorValue=float(balance['def']), gold=int(balance['goldcost']), wood=int(balance['lumbercost']), food=0, time=float(balance['bldtm']), speed=0, damage=0, range=0, radius=float(balance['collision']) / 100, collision=float(balance['collision']) / 100, modelScale=float(ui['modelScale']), selectionScale=float(ui['scale']), sourceRows={name: table[source] for name, table in tables.items()}, sourceFunc=func, sourceStrings=strings, slot=sum(int(v) * f for v, f in zip(func['Buttonpos'].split(','), [1, 4])), hotkey=strings['Hotkey'])
        for disabled in [False, True]:
            path = func['Art'].replace('\\', '/')
            if disabled: path = path.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
            png = io.BytesIO(); Image.open(io.BytesIO(original(path))).convert('RGBA').save(png, format='PNG')
            key = 'disabledIcon' if disabled else 'icon'; d[key] = 'Assets/Art/classic-' + kind + ('-disabled' if disabled else '') + '.png'; files[d[key]] = png.getvalue()
        expected = (1000, 205, 70, 2, 'M') if kind == 'warmill' else (900, 215, 80, 3, 'V')
        assert (d['hp'], d['gold'], d['time'], d['slot'], d['hotkey']) == expected and (d['wood'], d['armorValue'], d['radius']) == (0, 5, 1.44), source
        buildings[kind] = d
    files['lumber-depots.json'] = encode(dict(author='MiYu', sourceUnitsPerWorldUnit=100, sourceVariant='Frozen Throne', buildings=buildings))
    temporary = ROOT / 'tmp/docs-artifacts/frost-worker-lumber'; temporary.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='lumber-depots-', dir=temporary) as directory:
        work = pathlib.Path(directory); overlay = work / 'overlay'; geometry = work / 'geometry'; geometry.mkdir()
        (geometry / 'model-catalog.json').write_bytes(encode({})); (geometry / 'classic-sources.json').write_bytes(encode(dict(files=[])))
        bindings = work / 'bindings.json'; bindings.write_bytes(encode(dict(models=BINDINGS)))
        nodes = importlib.import_module('convert-frost-classic-billboards'); nodes.LIBRARY = args.library.resolve()
        classic = importlib.import_module('import-frost-classic'); classic.LIBRARY = nodes.LIBRARY
        sys.argv = ['convert-frost-classic-billboards.py', '--bindings', str(bindings), '--output', str(overlay), '--metadata-reader', str(args.metadata_reader)]; nodes.main()
        sys.argv = ['import-frost-classic.py', '--output', str(geometry), '--pose-probe', str(args.pose_probe), '--billboard-library', str(overlay), '--bindings', str(bindings), '--keys', *[b['key'] for b in BINDINGS]]; classic.main()
        remap = lambda path: path.replace('Assets/WarcraftIII/', 'Assets/LumberDepots/')
        models = json.loads((geometry / 'model-catalog.json').read_bytes())
        for d in buildings.values():
            model = models[d['model']]
            model.update(sourceUnit=d['sourceUnit'], sourceModelScale=d['modelScale'], sourceSelectionScale=d['selectionScale'], maxWorldHeight=model['size'][1] * 128 / 100 * d['modelScale'])
        files['lumber-depot-models.json'] = encode(json.loads(remap(json.dumps(models, ensure_ascii=False))))
        geometry_receipt = json.loads((geometry / 'classic-sources.json').read_bytes())
        for record in geometry_receipt['files']:
            path = remap(record['path']); raw = (geometry / record['path']).read_bytes(); assert sha(raw) == record['sha256']
            if path.endswith('.meta'):
                meta = json.loads(raw); meta['guid'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + path[:-5])); raw = encode(meta)
            elif path.endswith(('.mmat', '.json')): raw = remap(raw.decode('utf-8')).encode('utf-8')
            files[path] = raw
        node_receipt = json.loads((overlay / 'asset-sources.json').read_bytes())
        for record in node_receipt['generatedFiles']:
            if record['path'].startswith(('Nodes/', 'Licenses/')): files[source_root + 'Conversion/' + record['path']] = (overlay / record['path']).read_bytes()
        for record in node_receipt['sourceFiles']:
            raw = (args.library / record['pack'] / 'SourceAssets' / pathlib.PureWindowsPath(record['path']).as_posix()).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256']
            files[source_root + 'Models/' + pathlib.PureWindowsPath(record['path']).as_posix().replace('Buildings/', 'buildings/', 1)] = raw
    files['Assets/Licenses/Classic-Lumber-Depots.txt'] = b'Warcraft III War Mill, Graveyard, rules, command icons and original models: Blizzard Entertainment. Original game asset terms apply; these assets are not CC0 or MIT. Converter MIT terms and original license text are retained in SourceAssets/LumberDepots/Conversion/Licenses/. Archive identities, original bytes, selected rows, model collection and converter SHA-256 hashes: lumber-depot-sources.json and lumber-depots.json.\n'
    owned = {r['path'] for r in previous.get('files', [])}
    for path, raw in files.items():
        target = output / path
        assert not target.exists() or target.read_bytes() == raw or path in owned, 'Preserve unsigned output: ' + path
    generators = ['scripts/import-frost-lumber-depots.py', 'scripts/import-frost-human-army.py', 'scripts/import-frost-classic.py', 'scripts/convert-frost-classic-billboards.py', 'scripts/import-frost-wisp-rules.py', 'scripts/warcraft_mpq.py', 'scripts/warcraft-node-metadata/Program.cs', 'scripts/warcraft-node-metadata/NodeMetadata.csproj']
    receipt = dict(author='MiYu', archivePrecedence=['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'], sources=sorted(sources.values(), key=lambda r: r['path']), models=geometry_receipt['models'], nodeConversion=node_receipt, sourceCollections=node_receipt['sourceCollections'], generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes())) for p in generators], poseProbeSha256=sha(args.pose_probe.read_bytes()), metadataReaderSha256=sha(args.metadata_reader.read_bytes()), reproduce='python scripts/import-frost-lumber-depots.py --pose-probe <gltf_bounds.exe> --metadata-reader <NodeMetadata.dll>', files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    for path, raw in files.items():
        target = output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    (output / receipt_name).write_bytes(encode(receipt))
    for record in receipt['files']:
        raw = (output / record['path']).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
    print('PASS original lumber depots: two building profiles, four command icons, two native-stand models,', len(receipt['files']), 'signed outputs')


if __name__ == '__main__': main()

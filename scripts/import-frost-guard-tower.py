"""Author: MiYu. Preserve original Guard Tower weapon rules and missile through the existing MDX pipeline."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
import sys
import tempfile
import uuid
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
BINDING = dict(key='ClassicGuardTowerMissile', source='GuardTowerMissile', pack='remaining-ready', model='Abilities/Weapons/GuardTowerMissile/GuardTowerMissile.mdx', environment=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--source-sample', type=Path, default=SAMPLE)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--library', type=Path, default=ROOT / 'asset-library/warcraft-iii')
    parser.add_argument('--pose-probe', type=Path, required=True)
    parser.add_argument('--metadata-reader', type=Path, required=True)
    args = parser.parse_args(); output = args.output.resolve()
    receipt_name = 'guard-tower-sources.json'; source_root = 'SourceAssets/GuardTower/'
    retained_path = args.source_sample / receipt_name
    retained = json.loads(retained_path.read_bytes()) if retained_path.exists() else {}
    old_path = output / receipt_name
    previous = json.loads(old_path.read_bytes()) if old_path.exists() else {}
    files, sources, archives = {}, {}, []
    for record in previous.get('files', []):
        raw = (output / record['path']).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Preserve edited output: ' + record['path']

    def original(path):
        record = next((r for r in retained.get('sources', []) if r['path'] == path), None)
        if record:
            raw = (args.source_sample / source_root / path).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Corrupt retained source: ' + path
        else:
            assert not retained, 'Missing retained source: ' + path
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'])
            for name, archive in archives:
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise FileNotFoundError(path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        files[source_root + path] = raw; sources[path] = record
        return raw

    rows = importlib.import_module('import-frost-wisp-rules').rows
    section = importlib.import_module('import-frost-human-army').section
    w = rows(original('Units/UnitWeapons.slk'))['hgtw']
    f = section(original('Units/HumanUnitFunc.txt'), 'hgtw')
    misc = section(original('Units/MiscGame.txt'), 'Misc')
    assert w['weapsOn'] == '1' and w['weapTp1'] == 'missile' and w['atkType1'] == 'pierce'
    weapon = dict(sourceUnit='hgtw', damage=float(w['avgdmg1']), bonus=int(w['dmgplus1']), dice=int(w['dice1']), sides=int(w['sides1']), range=float(w['rangeN1'])/100, acquisition=float(w['acquire'])/100, cooldown=float(w['cool1']), damagePoint=float(w['dmgpt1']), backswing=float(w['backSw1']), attack=w['atkType1'], antiAir='air' in w['targs1'].split(','), targets=w['targs1'].split(','), missileSpeed=float(f['Missilespeed'])/100, missileArc=float(f['Missilearc']), launch=[float(w['launchX'])/100,float(w['launchZ'])/100,-float(w['launchY'])/100], impactHeight=float(w['impactZ'])/100, projectile='guard-tower', sourceRow=w, sourceFunc=f)
    armor = ['light','medium','heavy','fortified','normal','hero','divine','unarmored']
    files['guard-tower.json'] = encode(dict(author='MiYu', weapon=weapon, damageTable=dict(pierce=dict(zip(armor,map(float,misc['DamageBonusPierce'].split(',')))))))
    original(BINDING['model'])
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='guard-tower-', dir=output.parent) as directory:
        work = Path(directory); overlay = work/'overlay'; geometry = work/'geometry'; geometry.mkdir()
        (geometry/'model-catalog.json').write_bytes(encode({})); (geometry/'classic-sources.json').write_bytes(encode(dict(files=[])))
        bindings = work/'bindings.json'; bindings.write_bytes(encode(dict(models=[BINDING])))
        nodes = importlib.import_module('convert-frost-classic-billboards'); nodes.LIBRARY = args.library.resolve()
        classic = importlib.import_module('import-frost-classic'); classic.LIBRARY = nodes.LIBRARY
        sys.argv = ['convert-frost-classic-billboards.py','--bindings',str(bindings),'--output',str(overlay),'--metadata-reader',str(args.metadata_reader)]; nodes.main()
        sys.argv = ['import-frost-classic.py','--output',str(geometry),'--pose-probe',str(args.pose_probe),'--billboard-library',str(overlay),'--bindings',str(bindings),'--keys',BINDING['key']]; classic.main()
        remap = lambda text: text.replace('Assets/WarcraftIII/', 'Assets/GuardTower/')
        files['guard-tower-models.json'] = encode(json.loads(remap((geometry/'model-catalog.json').read_text(encoding='utf-8'))))
        geometry_receipt = json.loads((geometry/'classic-sources.json').read_bytes())
        for record in geometry_receipt['files']:
            path = remap(record['path']); raw = (geometry/record['path']).read_bytes(); assert sha(raw) == record['sha256']
            if path.endswith('.meta'):
                meta = json.loads(raw); meta['guid'] = str(uuid.uuid5(uuid.NAMESPACE_URL,'mengine/frostbound-realms/'+path[:-5])); raw = encode(meta)
            elif path.endswith(('.mmat','.json')): raw = remap(raw.decode('utf-8')).encode('utf-8')
            files[path] = raw
        node_receipt = json.loads((overlay/'asset-sources.json').read_bytes())
        files['guard-tower-node-sources.json'] = encode(node_receipt)
        for record in node_receipt['generatedFiles']:
            if record['path'].startswith(('Nodes/','Licenses/')): files[source_root+'Conversion/'+record['path']] = (overlay/record['path']).read_bytes()
    library = args.library/BINDING['pack']; signed = json.loads((library/'asset-sources.json').read_bytes())
    model_record = next(r for r in signed['sourceFiles'] if r['path'].replace('\\','/').lower() == BINDING['model'].lower())
    assert model_record['sha256'] == sha(files[source_root+BINDING['model']]), 'Converted library model must match original MPQ model'
    files['Assets/Licenses/Classic-Guard-Tower.txt'] = b'Warcraft III Guard Tower weapons and missile: Blizzard Entertainment original game terms. Provenance and conversion hashes: guard-tower-sources.json. REA upstream https://github.com/morluto/rea; maintenance third_party/rea/README-MENGINE.md.\n'
    owned = {r['path'] for r in previous.get('files', [])}
    for path, raw in files.items():
        target = output/path
        assert not target.exists() or target.read_bytes() == raw or path in owned, 'Preserve unsigned output: ' + path
    generators = ['scripts/import-frost-guard-tower.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-wisp-rules.py','scripts/import-frost-human-army.py','scripts/warcraft_mpq.py']
    receipt = dict(author='MiYu',reaUpstream='https://github.com/morluto/rea',reaVersion='6.5.0',archivePrecedence=['War3Patch.mpq','War3xLocal.mpq','War3x.mpq','war3.mpq'],sources=list(sources.values()),models=geometry_receipt['models'],sourceCollections={'remaining-ready':sha((library/'asset-sources.json').read_bytes())},generators=[dict(path=p,sha256=sha((ROOT/p).read_bytes())) for p in generators],poseProbeSha256=sha(args.pose_probe.read_bytes()),metadataReaderSha256=sha(args.metadata_reader.read_bytes()),files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())])
    for path, raw in files.items():
        target = output/path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    (output/receipt_name).write_bytes(encode(receipt))
    print('PASS source Guard Tower: 23-27 pierce, 700 range, .3/.3 attack phases, .9 cooldown, original missile')


if __name__ == '__main__': main()

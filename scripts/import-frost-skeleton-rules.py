"""Author: MiYu. Reproduce original Skeleton Warrior/Mage statistics, research cards and source missile."""
import argparse
import csv
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
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-human-army').section
sanctum = importlib.import_module('import-frost-human-sanctum')
BINDINGS = [dict(key='ClassicSkeletalMageMissile', source='SkeletalMageMissile', pack='remaining-ready', model='Abilities/Weapons/SkeletalMageMissile/SkeletalMageMissile.mdx', environment=True)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--source-sample', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--library', type=pathlib.Path, default=ROOT / 'asset-library/warcraft-iii')
    parser.add_argument('--pose-probe', type=pathlib.Path, required=True)
    parser.add_argument('--metadata-reader', type=pathlib.Path, required=True)
    args = parser.parse_args(); output = args.output.resolve()
    receipt_name = 'skeleton-rules-sources.json'; source_root = 'SourceAssets/SkeletonRules/'
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
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'])
            for name, archive in archives:
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise FileNotFoundError(path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        sources[path] = record; files[source_root + path] = raw
        return raw

    def icons(name, art):
        result = {}
        for disabled in [False, True]:
            path = art.replace('\\', '/')
            if disabled: path = path.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
            png = io.BytesIO(); Image.open(io.BytesIO(original(path))).convert('RGBA').save(png, format='PNG')
            key = 'disabledIcon' if disabled else 'icon'; result[key] = 'Assets/Art/classic-skeleton-' + name + ('-disabled' if disabled else '') + '.png'; files[result[key]] = png.getvalue()
        return result

    tables = {name: rows(original('Units/' + name + '.slk')) for name in ['UnitBalance', 'UnitWeapons', 'UnitUI', 'UnitAbilities', 'UpgradeData']}
    profiles, research = {}, {}
    for kind, source, model in [('skeletonwarrior','uske','RealSkeletonWarrior'),('skeletonmage','uskm','RealSkeletonMage')]:
        b,w,ui,a = [tables[name][source] for name in ['UnitBalance','UnitWeapons','UnitUI','UnitAbilities']]
        func,text = [section(original('Units/UndeadUnit'+name+'.txt'),source) for name in ['Func','Strings']]
        number = lambda row,key: float(row.get(key,'0')) if row.get(key,'0').strip() not in ['-','_',''] else 0
        profiles[kind] = dict(sourceUnit=source,model=model,label=text['Name'],hp=int(b['HP']),armor={'large':'heavy','medium':'medium'}[b['defType']],armorValue=number(b,'def'),armorPerRank=number(b,'defUp'),gold=0,wood=0,food=0,speed=number(b,'spd')/100,damage=number(w,'avgdmg1'),range=number(w,'rangeN1')/100,collision=number(b,'collision')/100,healthRegen=number(b,'regenHP'),regenerationType=b['regenType'],sight=number(b,'sight')/100,nightSight=number(b,'nsight')/100,organic=True,attack=w['atkType1'],antiAir='air' in w['targs1'].split(','),lifesteal=0,slow=0,cooldown=number(w,'cool1'),damagePoint=number(w,'dmgpt1'),backswing=number(w,'backSw1'),dice=int(w['dice1']),sides=int(w['sides1']),bonus=number(w,'dmgplus1'),missileSpeed=number(func,'Missilespeed')/100,missileArc=number(func,'Missilearc'),launch=[number(w,'launchX')/100,number(w,'launchZ')/100,-number(w,'launchY')/100],impactHeight=number(w,'impactZ')/100,acquisition=number(w,'acquire')/100,projectile='source-skeleton',sourceRows={name:tables[name][source] for name in ['UnitBalance','UnitWeapons','UnitUI','UnitAbilities']},sourceFunc=func,sourceStrings=text,**icons(kind,func['Art']))
    for key,source,field in [('longevity','Rusl','skeletalLongevity'),('mastery','Rusm','skeletalMastery')]:
        r=tables['UpgradeData'][source];func,text=[section(original('Units/UndeadUpgrade'+name+'.txt'),source) for name in ['Func','Strings']]
        research[key]=dict(sourceResearch=source,field=field,name=text['Name'],hotkey=text['Hotkey'],tooltip=text['Ubertip'].strip('"'),slot=sanctum.slot(func),gold=int(r['goldbase']),wood=int(r['lumberbase']),time=float(r['timebase']),requires=sanctum.requires(func),tier=3 if func.get('Requires')=='unp2' else 2,sourceRow=r,sourceFunc=func,sourceStrings=text,**icons(key,func['Art']))
    abilities=rows(original('Units/AbilityData.slk'))
    raise_row=abilities['Arai']
    raise_rules=dict(sourceAbility='Arai',sourceRow=raise_row,warrior=raise_row['UnitID1'],mage=raise_row['DataD2'],duration=float(raise_row['Dur1']),longevity=float(research['longevity']['sourceRow']['base1']))
    misc=section(original('Units/MiscGame.txt'),'Misc');armor=['light','medium','heavy','fortified','normal','hero','divine','unarmored']
    files['skeleton-rules.json']=encode(dict(author='MiYu',sourceUnitsPerWorldUnit=100,units=profiles,research=research,raiseDead=raise_rules,damageTable={key:dict(zip(armor,map(float,misc['DamageBonus'+name].split(',')))) for key,name in [('normal','Normal'),('pierce','Pierce')]}))
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='skeleton-rules-', dir=output.parent) as directory:
        work = pathlib.Path(directory); overlay = work / 'overlay'; geometry = work / 'geometry'; geometry.mkdir()
        (geometry / 'model-catalog.json').write_bytes(encode({})); (geometry / 'classic-sources.json').write_bytes(encode(dict(files=[])))
        bindings = work / 'bindings.json'; bindings.write_bytes(encode(dict(models=BINDINGS)))
        nodes = importlib.import_module('convert-frost-classic-billboards'); nodes.LIBRARY = args.library.resolve()
        classic = importlib.import_module('import-frost-classic'); classic.LIBRARY = nodes.LIBRARY
        sys.argv = ['convert-frost-classic-billboards.py', '--bindings', str(bindings), '--output', str(overlay), '--metadata-reader', str(args.metadata_reader)]; nodes.main()
        sys.argv = ['import-frost-classic.py', '--output', str(geometry), '--pose-probe', str(args.pose_probe), '--billboard-library', str(overlay), '--bindings', str(bindings), '--keys', *[b['key'] for b in BINDINGS]]; classic.main()
        remap = lambda path: path.replace('Assets/WarcraftIII/', 'Assets/SkeletonRules/')
        files['skeleton-rule-models.json'] = encode(json.loads(remap((geometry / 'model-catalog.json').read_text(encoding='utf-8'))))
        geometry_receipt = json.loads((geometry / 'classic-sources.json').read_bytes())
        for record in geometry_receipt['files']:
            path = remap(record['path']); raw = (geometry / record['path']).read_bytes(); assert sha(raw) == record['sha256']
            if path.endswith('.meta'):
                meta = json.loads(raw); meta['guid'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + path[:-5])); raw = encode(meta)
            elif path.endswith(('.mmat', '.json')): raw = remap(raw.decode('utf-8')).encode('utf-8')
            files[path] = raw
        node_receipt = json.loads((overlay / 'asset-sources.json').read_bytes()); files['skeleton-rule-node-sources.json'] = encode(node_receipt)
        for record in node_receipt['generatedFiles']:
            if record['path'].startswith(('Nodes/', 'Licenses/')): files[source_root + 'Conversion/' + record['path']] = (overlay / record['path']).read_bytes()
    files['Assets/Licenses/Classic-Skeleton-Rules.txt'] = b'Warcraft III Skeleton Warrior/Mage statistics, research cards and missile: Blizzard Entertainment. Original game terms apply; not CC0 or MIT. See skeleton-rules-sources.json for archive identities, retained original bytes and generator hashes. REA upstream: https://github.com/morluto/rea; fixed runtime and maintenance: third_party/rea/README-MENGINE.md.\n'
    owned = {r['path'] for r in previous.get('files', [])}
    for path, raw in files.items():
        target = output / path
        assert not target.exists() or target.read_bytes() == raw or path in owned, 'Preserve unsigned output: ' + path
    generators = ['scripts/import-frost-skeleton-rules.py', 'scripts/import-frost-human-sanctum.py', 'scripts/import-frost-human-army.py', 'scripts/import-frost-classic.py', 'scripts/convert-frost-classic-billboards.py', 'scripts/import-frost-wisp-rules.py', 'scripts/warcraft_mpq.py', 'scripts/warcraft-node-metadata/Program.cs', 'scripts/warcraft-node-metadata/NodeMetadata.csproj']
    receipt = dict(author='MiYu', reusedModels=[dict(key=k,catalog='model-catalog.json',catalogSha256=sha((args.source_sample/'model-catalog.json').read_bytes())) for k in ['RealSkeletonWarrior','RealSkeletonMage']], archivePrecedence=['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'], sources=sorted(sources.values(), key=lambda r: r['path']), models=geometry_receipt['models'], sourceCollections={'remaining-ready': sha((args.library / 'remaining-ready/asset-sources.json').read_bytes())}, generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes())) for p in generators], poseProbeSha256=sha(args.pose_probe.read_bytes()), metadataReaderSha256=sha(args.metadata_reader.read_bytes()), files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    for path, raw in files.items():
        target = output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    (output / receipt_name).write_bytes(encode(receipt))
    print('PASS original Skeleton Warrior/Mage: source statistics, two research cards and Skeletal Mage missile')


if __name__ == '__main__': main()

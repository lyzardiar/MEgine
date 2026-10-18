"""Author: MiYu. Reproduce original Crypt Fiend/Gargoyle bodies, dual weapons, portraits and missiles."""
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
BINDINGS = [dict(key='ClassicCryptFiend',source='CryptFiend',pack='game-ready',model='Units/Undead/CryptFiend/CryptFiend.mdx'),dict(key='ClassicGargoyle',source='Gargoyle',pack='game-ready',model='Units/Undead/Gargoyle/Gargoyle.mdx'),dict(key='ClassicCryptFiendPortrait',source='CryptFiend_portrait',pack='remaining-ready',model='Units/Undead/CryptFiend/CryptFiend_portrait.mdx'),dict(key='ClassicGargoylePortrait',source='Gargoyle_portrait',pack='remaining-ready',model='Units/Undead/Gargoyle/Gargoyle_portrait.mdx'),dict(key='ClassicCryptFiendMissile',source='CryptFiendMissile',pack='remaining-ready',model='Abilities/Weapons/CryptFiendMissile/CryptFiendMissile.mdx',environment=True),dict(key='ClassicGargoyleMissile',source='GargoyleMissile',pack='remaining-ready',model='Abilities/Weapons/GargoyleMissile/GargoyleMissile.mdx',environment=True)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--source-sample', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--library', type=pathlib.Path, default=ROOT / 'asset-library/warcraft-iii')
    parser.add_argument('--pose-probe', type=pathlib.Path, required=True)
    parser.add_argument('--metadata-reader', type=pathlib.Path, required=True)
    args = parser.parse_args(); output = args.output.resolve()
    receipt_name = 'crypt-units-sources.json'; source_root = 'SourceAssets/CryptUnits/'
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
            key = 'disabledIcon' if disabled else 'icon'; result[key] = 'Assets/Art/classic-crypt-' + name + ('-disabled' if disabled else '') + '.png'; files[result[key]] = png.getvalue()
        return result

    tables = {name: rows(original('Units/' + name + '.slk')) for name in ['UnitBalance', 'UnitWeapons', 'UnitUI', 'UnitAbilities', 'UnitData']}
    profiles={}
    number=lambda row,key:float(row.get(key,'0')) if row.get(key,'0').strip() not in ['-','_',''] else 0
    for kind,source,model in [('cryptfiend','ucry','ClassicCryptFiend'),('gargoyle','ugar','ClassicGargoyle')]:
        b,w,ui,a,m=[tables[name][source] for name in ['UnitBalance','UnitWeapons','UnitUI','UnitAbilities','UnitData']]
        func,text=[section(original('Units/UndeadUnit'+name+'.txt'),source) for name in ['Func','Strings']]
        weapons={}
        for slot in [1,2]:
            if int(w['weapsOn']) & slot == 0:continue
            n=str(slot);weapons[n]=dict(slot=slot,damage=number(w,'avgdmg'+n),attack=w['atkType'+n],range=number(w,'rangeN'+n)/100,cooldown=number(w,'cool'+n),damagePoint=number(w,'dmgpt'+n),backswing=number(w,'backSw'+n),dice=int(w['dice'+n]),sides=int(w['sides'+n]),bonus=number(w,'dmgplus'+n),targets=w['targs'+n].split(','),missile=w['weapTp'+n]=='missile')
        first=weapons['1'];profiles[kind]=dict(sourceUnit=source,model=model,portrait=model+'Portrait',label=text['Name'],hp=int(b['HP']),armor={'medium':'medium','none':'unarmored'}[b['defType']],armorValue=number(b,'def'),gold=int(b['goldcost']),wood=int(b['lumbercost']),food=int(b['fused']),time=number(b,'bldtm'),speed=number(b,'spd')/100,collision=number(b,'collision')/100,healthRegen=number(b,'regenHP'),regenerationType=b['regenType'],sight=number(b,'sight')/100,nightSight=number(b,'nsight')/100,organic=True,lifesteal=0,slow=0,modelScale=number(ui,'modelScale'),selectionScale=number(ui,'scale'),hotkey=text['Hotkey'],slot=sum(int(v)*n for v,n in zip(func['Buttonpos'].split(','),[1,4])),requires=func.get('Requires','').split(',') if func.get('Requires') else [],air=m['targType']=='air',flying=m['targType']=='air',antiAir=any('air' in v['targets'] for v in weapons.values()),flightHeight=number(m,'moveHeight')/100,leavesCorpse=m['deathType']!='0',weapons=weapons,**{k:v for k,v in first.items() if k not in ['slot','targets','missile']},missileSpeed=number(func,'Missilespeed')/100,missileArc=number(func,'Missilearc'),missileHoming=func.get('MissileHoming','1')=='1',launch=[number(w,'launchX')/100,number(w,'launchZ')/100,-number(w,'launchY')/100],impactHeight=number(w,'impactZ')/100,projectile='source-'+kind,acquisition=number(w,'acquire')/100,mana=0,initialMana=0,manaRegen=0,sourceRows={name:tables[name][source] for name in tables},sourceFunc=func,sourceStrings=text,**icons(kind,func['Art']))
    misc=section(original('Units/MiscGame.txt'),'Misc');armor=['light','medium','heavy','fortified','normal','hero','divine','unarmored']
    files['crypt-units.json']=encode(dict(author='MiYu',sourceUnitsPerWorldUnit=100,units=profiles,roster=['ghoul','cryptfiend','gargoyle'],damageTable={key:dict(zip(armor,map(float,misc['DamageBonus'+name].split(',')))) for key,name in [('normal','Normal'),('pierce','Pierce')]}))
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='crypt-units-', dir=output.parent) as directory:
        work = pathlib.Path(directory); overlay = work / 'overlay'; geometry = work / 'geometry'; geometry.mkdir()
        (geometry / 'model-catalog.json').write_bytes(encode({})); (geometry / 'classic-sources.json').write_bytes(encode(dict(files=[])))
        bindings = work / 'bindings.json'; bindings.write_bytes(encode(dict(models=BINDINGS)))
        nodes = importlib.import_module('convert-frost-classic-billboards'); nodes.LIBRARY = args.library.resolve()
        classic = importlib.import_module('import-frost-classic'); classic.LIBRARY = nodes.LIBRARY
        sys.argv = ['convert-frost-classic-billboards.py', '--bindings', str(bindings), '--output', str(overlay), '--metadata-reader', str(args.metadata_reader)]; nodes.main()
        sys.argv = ['import-frost-classic.py', '--output', str(geometry), '--pose-probe', str(args.pose_probe), '--billboard-library', str(overlay), '--bindings', str(bindings), '--keys', *[b['key'] for b in BINDINGS]]; classic.main()
        remap = lambda path: path.replace('Assets/WarcraftIII/', 'Assets/CryptUnits/')
        files['crypt-unit-models.json'] = encode(json.loads(remap((geometry / 'model-catalog.json').read_text(encoding='utf-8'))))
        geometry_receipt = json.loads((geometry / 'classic-sources.json').read_bytes())
        for record in geometry_receipt['files']:
            path = remap(record['path']); raw = (geometry / record['path']).read_bytes(); assert sha(raw) == record['sha256']
            if path.endswith('.meta'):
                meta = json.loads(raw); meta['guid'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + path[:-5])); raw = encode(meta)
            elif path.endswith(('.mmat', '.json')): raw = remap(raw.decode('utf-8')).encode('utf-8')
            files[path] = raw
        node_receipt = json.loads((overlay / 'asset-sources.json').read_bytes()); files['crypt-unit-node-sources.json'] = encode(node_receipt)
        for record in node_receipt['generatedFiles']:
            if record['path'].startswith(('Nodes/', 'Licenses/')): files[source_root + 'Conversion/' + record['path']] = (overlay / record['path']).read_bytes()
    portraits={};portrait_camera=importlib.import_module('import-frost-dryad-portrait').convert
    for binding in BINDINGS:
        library=args.library/binding['pack'];signed=json.loads((library/'asset-sources.json').read_bytes());record=next(r for r in signed['sourceFiles'] if r['path'].replace('\\','/').lower()==binding['model'].lower());path=record['path'].replace('\\','/');raw=(library/'SourceAssets'/path).read_bytes();assert sha(raw)==record['sha256'] and len(raw)==record['bytes'];files[source_root+path]=raw
        if binding['key'].endswith('Portrait'):portraits[binding['key']]=dict(source=path,sourceSha256=sha(raw),**portrait_camera(raw))
    files['crypt-unit-portraits.json']=encode(portraits)
    files['Assets/Licenses/Classic-Crypt-Units.txt']=b'Warcraft III Crypt Fiend/Gargoyle data, portraits, models, icons and missiles: Blizzard Entertainment original game terms. Source and conversion hashes: crypt-units-sources.json. REA upstream https://github.com/morluto/rea; fixed runtime and maintenance third_party/rea/README-MENGINE.md.\n'
    owned = {r['path'] for r in previous.get('files', [])}
    for path, raw in files.items():
        target = output / path
        assert not target.exists() or target.read_bytes() == raw or path in owned, 'Preserve unsigned output: ' + path
    generators = ['scripts/import-frost-crypt-units.py', 'scripts/import-frost-human-sanctum.py', 'scripts/import-frost-human-army.py', 'scripts/import-frost-classic.py', 'scripts/convert-frost-classic-billboards.py', 'scripts/import-frost-wisp-rules.py', 'scripts/warcraft_mpq.py', 'scripts/import-frost-dryad-portrait.py', 'scripts/warcraft-node-metadata/Program.cs', 'scripts/warcraft-node-metadata/NodeMetadata.csproj']
    receipt = dict(author='MiYu', reaUpstream='https://github.com/morluto/rea',reaVersion='6.5.0', archivePrecedence=['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'], sources=sorted(sources.values(), key=lambda r: r['path']), models=geometry_receipt['models'], sourceCollections={pack:sha((args.library/pack/'asset-sources.json').read_bytes()) for pack in ['game-ready','remaining-ready']}, generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes())) for p in generators], poseProbeSha256=sha(args.pose_probe.read_bytes()), metadataReaderSha256=sha(args.metadata_reader.read_bytes()), files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    for path, raw in files.items():
        target = output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    (output / receipt_name).write_bytes(encode(receipt))
    print('PASS original Crypt Fiend/Gargoyle: source bodies, dual weapons, portraits and missiles')


if __name__ == '__main__': main()

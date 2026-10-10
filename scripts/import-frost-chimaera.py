"""Author: MiYu. Import original Chimaera bodies, portraits, icons and source rules."""
import argparse
import importlib
material_meta = importlib.import_module('import-frost-classic').remap_material_meta
import json
import pathlib
import subprocess
import sys
import tempfile

base = importlib.import_module('import-frost-druids')
camera = importlib.import_module('import-frost-dryad-portrait')
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode
BINDINGS = [
    dict(key='ClassicChimaeraBody', source='Chimaera', pack='game-ready', model='Units/NightElf/Chimaera/Chimaera.mdx'),
    dict(key='ClassicChimaeraRoost', source='ChimaeraRoost', pack='game-ready', model='buildings/NightElf/ChimaeraRoost/ChimaeraRoost.mdx', building=True),
    dict(key='ClassicChimaeraPortrait', source='Chimaera_Portrait', pack='remaining-ready', model='Units/NightElf/Chimaera/Chimaera_Portrait.mdx', environment=True),
    dict(key='ClassicChimaeraAcidMissile', source='ChimaeraAcidMissile', pack='remaining-ready', model='Abilities/Weapons/ChimaeraAcidMissile/ChimaeraAcidMissile.mdx', environment=True),
    dict(key='ClassicChimaeraLightningMissile', source='ChimaeraLightningMissile', pack='remaining-ready', model='Abilities/Weapons/ChimaeraLightningMissile/ChimaeraLightningMissile.mdx', environment=True),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--pose-probe', type=pathlib.Path, default=pathlib.Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'))
    parser.add_argument('--metadata-reader', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    args = parser.parse_args(); files, sources, archives = {}, [], []
    with tempfile.TemporaryDirectory(prefix='frost-chimaera-') as temp:
        work = pathlib.Path(temp); geometry = work / 'geometry'; geometry.mkdir()
        (geometry / 'model-catalog.json').write_bytes(encode({}))
        bindings = work / 'bindings.json'; bindings.write_bytes(encode(dict(models=BINDINGS)))
        overlay = work / 'overlay'
        def run(script, *params): subprocess.run([sys.executable, str(ROOT / 'scripts' / script), *map(str, params)], check=True)
        run('convert-frost-classic-billboards.py', '--bindings', bindings, '--output', overlay, '--metadata-reader', args.metadata_reader)
        run('import-frost-classic.py', '--bindings', bindings, '--output', geometry, '--keys', *[r['key'] for r in BINDINGS], '--billboard-library', overlay, '--pose-probe', args.pose_probe)
        mesh_receipt = json.loads((geometry / 'classic-sources.json').read_bytes())
        for record in mesh_receipt['files']:
            raw = (geometry / record['path']).read_bytes(); assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
            target = record['path'].replace('Assets/WarcraftIII/', 'Assets/Chimaera/')
            if target.endswith('.mmat'): raw = raw.replace(b'Assets/WarcraftIII/', b'Assets/Chimaera/')
            files[target] = material_meta(target, raw)
        files['chimaera-models.json'] = (geometry / 'model-catalog.json').read_bytes().replace(b'Assets/WarcraftIII/', b'Assets/Chimaera/')
        files['SourceAssets/Chimaera/node-conversion.json'] = (overlay / 'asset-sources.json').read_bytes()
        portraits = {}
        for binding in BINDINGS:
            library = ROOT / 'asset-library/warcraft-iii' / binding['pack']
            signed = json.loads((library / 'asset-sources.json').read_bytes())
            record = next(r for r in signed['sourceFiles'] if r['path'].replace('\\', '/').lower() == binding['model'].lower())
            path = record['path'].replace('\\', '/'); raw = (library / 'SourceAssets' / path).read_bytes()
            assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
            sample_path = 'Buildings/' + path[len('buildings/'):] if path.startswith('buildings/') else path
            files['SourceAssets/WarcraftIII/' + sample_path] = raw; sources.append(dict(record, path=sample_path, libraryPath=path, pack=binding['pack']))
            if binding['key'].endswith('Portrait'): portraits[binding['key']] = dict(source=path, sourceSha256=sha(raw), **camera.convert(raw))
        files['chimaera-portraits.json'] = encode(portraits)
    signed = {r['path']:r for r in json.loads((SAMPLE / 'druid-sources.json').read_bytes())['files']}
    def original(path):
        p = 'SourceAssets/WarcraftIII/' + path; raw = (SAMPLE / p).read_bytes(); record = signed[p]
        assert sha(raw) == record['sha256'] and len(raw) == record['bytes'], p
        files[p] = raw; sources.append(dict(path=path, bytes=len(raw), sha256=sha(raw), receipt='druid-sources.json'))
        return raw
    tables = {name:base.rows(original('Units/' + name + '.slk')) for name in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI','AbilityData','AbilityMetaData','UpgradeData']}
    texts = {name:original('Units/NightElf' + name + '.txt') for name in ['UnitFunc','UnitStrings','AbilityFunc','AbilityStrings','UpgradeFunc','UpgradeStrings']}
    def icons(key, path):
        result = {}
        for field, source in [('icon',path),('disabledIcon',path.replace('\\CommandButtons\\BTN','\\CommandButtonsDisabled\\DISBTN'))]:
            if not archives: archives.extend((n,base.mpyq.MPQArchive(str(args.game / n),listfile=False)) for n in ['war3.mpq','War3x.mpq','War3xLocal.mpq','War3Patch.mpq'])
            for archive_name, archive in reversed(archives):
                try: raw = base.read_archive(archive,source); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original icon: ' + source)
            source = source.replace('\\','/'); files['SourceAssets/WarcraftIII/' + source] = raw
            sources.append(dict(path=source, archive=archive_name, bytes=len(raw), sha256=sha(raw)))
            target = 'Assets/Art/classic-' + key + ('-disabled' if field == 'disabledIcon' else '') + '.png'
            files[target] = base.base.decode_icon(raw); result[field] = target
        return result
    numeric = lambda v: float(v) if v.strip() not in ['-','_',''] else 0
    units, buildings = {}, {}
    for key, source, label, model in [('chimaera','echm','Chimaera','ClassicChimaeraBody'),('chimaeraroost','edos','Chimaera Roost','ClassicChimaeraRoost')]:
        b, movement, w, ui = [tables[n][source] for n in ['UnitBalance','UnitData','UnitWeapons','unitUI']]
        art, text = base.section(texts['UnitFunc'],source), base.section(texts['UnitStrings'],source)
        data = dict(sourceUnit=source,label=label,model=model,hp=int(b['HP']),armor={'small':'light','fort':'fortified'}[b['defType']],armorValue=float(b['def']),gold=int(b['goldcost']),wood=int(b['lumbercost']),food=numeric(b['fused']) or 0,time=float(b['bldtm']),speed=(numeric(b['spd']) or 0)/100,collision=float(b['collision'])/100,modelScale=float(ui['modelScale']),selectionScale=float(ui['scale']),hotkey=text['Hotkey'],sourceRows={n:tables[n][source] for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI']},sourceFunc=art,sourceStrings=text,**icons(key,art['Art']))
        if source=='edos':
            buildings[key] = dict(data,damage=0,range=0,radius=float(b['collision'])/100,mechanical=True,training=['chimaera'],requires=art['Requires'].split(','),slot=9)
            continue
        weapons = {}
        for n, missile in [('1','acid'),('2','lightning')]:
            weapons[n] = dict(damage=float(w['avgdmg'+n]),attack=w['atkType'+n],range=float(w['rangeN'+n])/100,cooldown=float(w['cool'+n]),damagePoint=float(w['dmgpt'+n]),backswing=float(w['backSw'+n]),missileSpeed=float(art['Missilespeed'].split(',')[int(n)-1])/100,missileArc=float(art['Missilearc'].split(',')[int(n)-1]),projectile='chimaera-'+missile,targets=w['targs'+n].split(','),splashTargets=w['splashTargs'+n].split(','),dice=int(w['dice'+n]),sides=int(w['sides'+n]),bonus=float(w['dmgplus'+n]))
        weapons['2']['splashBands'] = [[float(w['Farea2'])/100,1],[float(w['Harea2'])/100,float(w['Hfact2'])],[float(w['Qarea2'])/100,float(w['Qfact2'])]]
        units[key] = dict(data,**weapons['2'],portrait='ClassicChimaeraPortrait',slot=0,weapons=weapons,weaponMask=int(w['weapsOn']),launch=[float(w['launchX'])/100,float(w['launchZ'])/100,-float(w['launchY'])/100],flying=True,antiAir=False,flightHeight=float(movement['moveHeight'])/100,leavesCorpse=False,organic=True,maxMana=0,nightRegen=float(b['regenHP']))
    art = base.section(texts['UpgradeFunc'],'Recb')
    passive = base.section(texts['AbilityFunc'],'Acor')
    rules = dict(author='MiYu',schemaVersion=1,sourceUnitsPerWorldUnit=100,units=units,buildings=buildings,research=dict(Recb=dict(sourceRow=tables['UpgradeData']['Recb'],sourceFunc=art,sourceStrings=base.section(texts['UpgradeStrings'],'Recb'),**icons('research-Recb',art['Art']))),abilities=dict(Acor=dict(sourceRow=tables['AbilityData']['Acor'],sourceFunc=passive,sourceStrings=base.section(texts['AbilityStrings'],'Acor'))),unverified=['Original overlapping weapon priority, switching and shared cooldown','Acor legacy engine semantics; no additional DOT inferred'])
    files['chimaera-rules.json'] = encode(rules)
    files['Assets/Chimaera/.gitattributes'] = b'* -text whitespace=cr-at-eol\n'
    files['Assets/Licenses/Classic-Chimaera.txt'] = b'Original Warcraft III assets and rules belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source hashes and generators: chimaera-sources.json.\n'
    tools = ['scripts/import-frost-chimaera.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-dryad-portrait.py']
    receipt = dict(author='MiYu',generators={p:sha((ROOT/p).read_bytes()) for p in tools},poseProbeSha256=sha(args.pose_probe.read_bytes()),sources=sources,files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())])
    output = args.output.resolve(); receipt_path = output/'chimaera-sources.json'
    previous = json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {}; old = {r['path']:r['sha256'] for r in previous.get('files',[])}
    for p, raw in files.items():
        target = output/p
        assert not target.exists() or target.read_bytes()==raw or sha(target.read_bytes())==old.get(p), 'Preserve modified Chimaera output: ' + p
    for p, raw in files.items():
        target = output/p; target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists() or target.read_bytes()!=raw: target.write_bytes(raw)
    receipt_path.write_bytes(encode(receipt))
    print('PASS original Chimaera art and source rules:',len(files),'signed outputs')


if __name__ == '__main__': main()

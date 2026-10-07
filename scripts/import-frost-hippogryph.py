"""Author: MiYu. Import original Hippogryph bodies, portraits, icons and source rules."""
import argparse
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base = importlib.import_module('import-frost-druids')
camera = importlib.import_module('import-frost-dryad-portrait')
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode
BINDINGS = [
    dict(key='ClassicHippogryph', source='HippoGryph', pack='game-ready', model='Units/NightElf/HippoGryph/HippoGryph.mdx'),
    dict(key='ClassicHippogryphRider', source='RiddenHippoGryph', pack='game-ready', model='Units/NightElf/RiddenHippoGryph/RiddenHippoGryph.mdx'),
    dict(key='ClassicHippogryphPortrait', source='HippoGryph_Portrait', pack='remaining-ready', model='Units/NightElf/HippoGryph/HippoGryph_Portrait.mdx', environment=True),
    dict(key='ClassicHippogryphRiderPortrait', source='RiddenHippoGryph_Portrait', pack='remaining-ready', model='Units/NightElf/RiddenHippoGryph/RiddenHippoGryph_Portrait.mdx', environment=True),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--pose-probe', type=pathlib.Path, default=pathlib.Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'))
    parser.add_argument('--metadata-reader', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    args = parser.parse_args(); files, sources, archives = {}, [], []
    with tempfile.TemporaryDirectory(prefix='frost-hippogryph-') as temp:
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
            files[record['path']] = raw
        files['hippogryph-models.json'] = (geometry / 'model-catalog.json').read_bytes()
        files['SourceAssets/Hippogryph/node-conversion.json'] = (overlay / 'asset-sources.json').read_bytes()
        portraits = {}
        for binding in BINDINGS:
            library = ROOT / 'asset-library/warcraft-iii' / binding['pack']
            signed = json.loads((library / 'asset-sources.json').read_bytes())
            record = next(r for r in signed['sourceFiles'] if r['path'].replace('\\', '/').lower() == binding['model'].lower())
            path = record['path'].replace('\\', '/'); raw = (library / 'SourceAssets' / path).read_bytes()
            assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
            files['SourceAssets/WarcraftIII/' + path] = raw; sources.append(dict(record, pack=binding['pack']))
            if binding.get('environment'): portraits[binding['key']] = dict(source=path, sourceSha256=sha(raw), **camera.convert(raw))
        files['hippogryph-portraits.json'] = encode(portraits)
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
    units = {}
    for key, source, label, model in [('hippogryph','ehip','Hippogryph','ClassicHippogryph'),('hippogryphrider','ehpr','Hippogryph Archer','ClassicHippogryphRider')]:
        b, movement, w, ui = [tables[n][source] for n in ['UnitBalance','UnitData','UnitWeapons','unitUI']]
        art, text = base.section(texts['UnitFunc'],source), base.section(texts['UnitStrings'],source)
        units[key] = dict(sourceUnit=source,label=label,model=model,portrait=model+'Portrait',hp=int(b['HP']),armor={'none':'unarmored','small':'light'}[b['defType']],armorValue=float(b['def']),gold=int(b['goldcost']),wood=int(b['lumbercost']),food=int(b['fused']),time=float(b['bldtm']),damage=float(w['avgdmg1']),attack=w['atkType1'],range=float(w['rangeN1'])/100,cooldown=float(w['cool1']),damagePoint=float(w['dmgpt1']),launch=[float(w['launchX'])/100,float(w['launchZ'])/100,-float(w['launchY'])/100],speed=float(b['spd'])/100,collision=float(b['collision'])/100,flying=True,airOnly=w['targs1']=='air',antiAir='air' in w['targs1'].split(','),flightHeight=float(movement['moveHeight'])/100,leavesCorpse=int(movement['deathType'])!=0,organic=True,maxMana=0,nightRegen=float(b['regenHP']),modelScale=float(ui['modelScale']),selectionScale=float(ui['scale']),hotkey=text['Hotkey'],slot=0,missileSpeed=float(art.get('Missilespeed',0))/100,missileArc=float(art.get('Missilearc',0)),projectile='night-arrow',sourceRows={n:tables[n][source] for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI']},sourceFunc=art,sourceStrings=text,**icons(key,art['Art']))
    abilities = {}
    for key in ['Aco2','Aco3','Adec']:
        art = base.section(texts['AbilityFunc'],key)
        abilities[key] = dict(sourceRow=tables['AbilityData'][key],sourceFunc=art,sourceStrings=base.section(texts['AbilityStrings'],key),**icons(key,art['Art']))
    art = base.section(texts['UpgradeFunc'],'Reht')
    rules = dict(author='MiYu',schemaVersion=1,sourceUnitsPerWorldUnit=100,units=units,abilities=abilities,research=dict(Reht=dict(sourceRow=tables['UpgradeData']['Reht'],sourceFunc=art,sourceStrings=base.section(texts['UpgradeStrings'],'Reht'),**icons('research-Reht',art['Art']))),producer=dict(sourceUnit='eaow',sourceFunc=base.section(texts['UnitFunc'],'eaow')),unverified=['Original runtime mount/dismount life and effect transfer','Original partner selection and approach semantics'])
    files['hippogryph-rules.json'] = encode(rules)
    files['Assets/Licenses/Classic-Hippogryph.txt'] = b'Original Warcraft III assets and rules belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source hashes and generators: hippogryph-sources.json.\n'
    tools = ['scripts/import-frost-hippogryph.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-dryad-portrait.py']
    receipt = dict(author='MiYu',generators={p:sha((ROOT/p).read_bytes()) for p in tools},poseProbeSha256=sha(args.pose_probe.read_bytes()),sources=sources,files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())])
    output = args.output.resolve(); receipt_path = output/'hippogryph-sources.json'
    previous = json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {}; old = {r['path']:r['sha256'] for r in previous.get('files',[])}
    for p, raw in files.items():
        target = output/p
        assert not target.exists() or target.read_bytes()==raw or sha(target.read_bytes())==old.get(p), 'Preserve modified Hippogryph output: ' + p
    for p, raw in files.items():
        target = output/p; target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists() or target.read_bytes()!=raw: target.write_bytes(raw)
    receipt_path.write_bytes(encode(receipt))
    print('PASS original Hippogryph art and source rules:',len(files),'signed outputs')


if __name__ == '__main__': main()

"""Author: MiYu. Reproduce Necromancer/Shaman statistics, training cards and source missiles."""
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
BINDINGS = [dict(key='ClassicNecromancerMissile', source='NecromancerMissile', pack='remaining-ready', model='Abilities/Weapons/NecromancerMissile/NecromancerMissile.mdx', environment=True)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--source-sample', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--library', type=pathlib.Path, default=ROOT / 'asset-library/warcraft-iii')
    parser.add_argument('--pose-probe', type=pathlib.Path, required=True)
    parser.add_argument('--metadata-reader', type=pathlib.Path, required=True)
    args = parser.parse_args(); output = args.output.resolve()
    receipt_name = 'source-casters-sources.json'; source_root = 'SourceAssets/SourceCasters/'
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
            key = 'disabledIcon' if disabled else 'icon'; result[key] = 'Assets/Art/classic-source-' + name + ('-disabled' if disabled else '') + '.png'; files[result[key]] = png.getvalue()
        return result

    tables = {name: rows(original('Units/' + name + '.slk')) for name in ['UnitBalance', 'UnitWeapons', 'UnitUI', 'UnitAbilities', 'UpgradeData']}
    profiles = {}; research = {}
    for kind, source, race, model, key in [('necromancer', 'unec', 'Undead', 'RealNecromancer', 'Rune'), ('shaman', 'oshm', 'Orc', 'RealShaman', 'Rost'), ('temple', 'utod', 'Undead', 'RealTemple', None), ('spiritlodge', 'osld', 'Orc', 'ClassicSpiritLodge', None)]:
        b, w, ui, a = [tables[name][source] for name in ['UnitBalance', 'UnitWeapons', 'UnitUI', 'UnitAbilities']]
        func, text = [section(original('Units/' + race + 'Unit' + name + '.txt'), source) for name in ['Func', 'Strings']]
        mobile = key is not None
        d = dict(sourceUnit=source, model=model, label=text['Name'], hp=int(b['HP']), armor={'none': 'unarmored', 'fort': 'fortified'}[b['defType']], armorValue=float(b['def']), gold=int(b['goldcost']), wood=int(b['lumbercost']), food=int(b['fused']) if mobile else 0, time=float(b['bldtm']), speed=float(b['spd']) / 100 if mobile else 0, damage=float(w['avgdmg1']) if mobile else 0, range=float(w['rangeN1']) / 100 if mobile else 0, collision=float(b['collision']) / 100, healthRegen=float(b['regenHP']) if mobile else 0, regenerationType=b['regenType'], sight=float(b['sight']) / 100, nightSight=float(b['nsight']) / 100, organic=mobile, attack=w['atkType1'], antiAir=mobile, lifesteal=0, slow=0, modelScale=float(ui['modelScale']), selectionScale=float(ui['scale']), hotkey=text['Hotkey'], slot=sanctum.slot(func), requires=sanctum.requires(func), sourceRows={name: tables[name][source] for name in ['UnitBalance', 'UnitWeapons', 'UnitUI', 'UnitAbilities']}, sourceFunc=func, sourceStrings=text, **icons(kind, func['Art']))
        if mobile:
            d.update(training=key, mana=int(b['manaN']), initialMana=int(b['mana0']), manaRegen=float(b['regenMana']), cooldown=float(w['cool1']), damagePoint=float(w['dmgpt1']), backswing=float(w['backSw1']), castPoint=float(w['castpt']), castBackswing=float(w['castbsw']), dice=int(w['dice1']), sides=int(w['sides1']), bonus=float(w['dmgplus1']), missileSpeed=float(func['Missilespeed']) / 100, missileArc=float(func['Missilearc']), launch=[float(w['launchX']) / 100, float(w['launchZ']) / 100, -float(w['launchY']) / 100], impactHeight=float(w['impactZ']) / 100, acquisition=float(w['acquire']) / 100, projectile='source-' + kind)
            row = tables['UpgradeData'][key]; uf, us = [section(original('Units/' + race + 'Upgrade' + name + '.txt'), key) for name in ['Func', 'Strings']]
            values = lambda value: next(csv.reader([value]))
            arts, names, tips, hotkeys = [values(value) for value in [uf['Art'], us['Name'], us['Ubertip'], us['Hotkey']]]
            levels = [dict(level=i + 1, name=names[i], tooltip=tips[i], hotkey=hotkeys[i], gold=int(row['goldbase']) + i * int(row['goldmod']), wood=int(row['lumberbase']) + i * int(row['lumbermod']), time=float(row['timebase']) + i * float(row['timemod']), requires=sanctum.requires(uf, 'Requires' + (str(i) if i else '')), **icons(key.lower() + '-' + str(i + 1), arts[i])) for i in range(int(row['maxlevel']))]
            effects = [dict(effect=row['effect' + str(i)], base=float(row['base' + str(i)]), increment=float(row['mod' + str(i)])) for i in range(1, 5) if row['effect' + str(i)] != '_']
            research[key] = dict(sourceResearch=key, slot=sanctum.slot(uf), levels=levels, effects=effects, sourceRow=row, sourceFunc=uf, sourceStrings=us)
        profiles[kind] = d
    misc = section(original('Units/MiscGame.txt'), 'Misc'); armor = ['light', 'medium', 'heavy', 'fortified', 'normal', 'hero', 'divine', 'unarmored']
    files['source-casters.json'] = encode(dict(author='MiYu', sourceUnitsPerWorldUnit=100, units={k: v for k, v in profiles.items() if v['speed']}, buildings={k: v for k, v in profiles.items() if not v['speed']}, research=research, damageTable=dict(magic=dict(zip(armor, map(float, misc['DamageBonusMagic'].split(',')))))))
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='source-casters-', dir=output.parent) as directory:
        work = pathlib.Path(directory); overlay = work / 'overlay'; geometry = work / 'geometry'; geometry.mkdir()
        (geometry / 'model-catalog.json').write_bytes(encode({})); (geometry / 'classic-sources.json').write_bytes(encode(dict(files=[])))
        bindings = work / 'bindings.json'; bindings.write_bytes(encode(dict(models=BINDINGS)))
        nodes = importlib.import_module('convert-frost-classic-billboards'); nodes.LIBRARY = args.library.resolve()
        classic = importlib.import_module('import-frost-classic'); classic.LIBRARY = nodes.LIBRARY
        sys.argv = ['convert-frost-classic-billboards.py', '--bindings', str(bindings), '--output', str(overlay), '--metadata-reader', str(args.metadata_reader)]; nodes.main()
        sys.argv = ['import-frost-classic.py', '--output', str(geometry), '--pose-probe', str(args.pose_probe), '--billboard-library', str(overlay), '--bindings', str(bindings), '--keys', *[b['key'] for b in BINDINGS]]; classic.main()
        remap = lambda path: path.replace('Assets/WarcraftIII/', 'Assets/SourceCasters/')
        files['source-caster-models.json'] = encode(json.loads(remap((geometry / 'model-catalog.json').read_text(encoding='utf-8'))))
        geometry_receipt = json.loads((geometry / 'classic-sources.json').read_bytes())
        for record in geometry_receipt['files']:
            path = remap(record['path']); raw = (geometry / record['path']).read_bytes(); assert sha(raw) == record['sha256']
            if path.endswith('.meta'):
                meta = json.loads(raw); meta['guid'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + path[:-5])); raw = encode(meta)
            elif path.endswith(('.mmat', '.json')): raw = remap(raw.decode('utf-8')).encode('utf-8')
            files[path] = raw
        node_receipt = json.loads((overlay / 'asset-sources.json').read_bytes()); files['source-caster-node-sources.json'] = encode(node_receipt)
        for record in node_receipt['generatedFiles']:
            if record['path'].startswith(('Nodes/', 'Licenses/')): files[source_root + 'Conversion/' + record['path']] = (overlay / record['path']).read_bytes()
    files['Assets/Licenses/Classic-Source-Casters.txt'] = b'Warcraft III Necromancer/Shaman statistics, command cards and missiles: Blizzard Entertainment. Original game terms apply; not CC0 or MIT. See source-casters-sources.json for archive identities, retained original bytes and generator hashes. REA upstream: https://github.com/morluto/rea; fixed runtime and maintenance: third_party/rea/README-MENGINE.md.\n'
    owned = {r['path'] for r in previous.get('files', [])}
    for path, raw in files.items():
        target = output / path
        assert not target.exists() or target.read_bytes() == raw or path in owned, 'Preserve unsigned output: ' + path
    generators = ['scripts/import-frost-source-casters.py', 'scripts/import-frost-human-sanctum.py', 'scripts/import-frost-human-army.py', 'scripts/import-frost-classic.py', 'scripts/convert-frost-classic-billboards.py', 'scripts/import-frost-wisp-rules.py', 'scripts/warcraft_mpq.py', 'scripts/warcraft-node-metadata/Program.cs', 'scripts/warcraft-node-metadata/NodeMetadata.csproj']
    receipt = dict(author='MiYu', reusedModels=[dict(key='ClassicFarSeerMissile', catalog='farseer-effect-models.json', catalogSha256=sha((SAMPLE / 'farseer-effect-models.json').read_bytes()))], archivePrecedence=['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'], sources=sorted(sources.values(), key=lambda r: r['path']), models=geometry_receipt['models'], sourceCollections={'remaining-ready': sha((args.library / 'remaining-ready/asset-sources.json').read_bytes())}, generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes())) for p in generators], poseProbeSha256=sha(args.pose_probe.read_bytes()), metadataReaderSha256=sha(args.metadata_reader.read_bytes()), files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    for path, raw in files.items():
        target = output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    (output / receipt_name).write_bytes(encode(receipt))
    print('PASS original Necromancer/Shaman: source statistics, four training cards and Necromancer missile; Shaman reuses the source Far Seer missile')


if __name__ == '__main__': main()

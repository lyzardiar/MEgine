"""Author: MiYu. Reproduce Arcane Sanctum rules, Frozen Throne actors and source projectiles."""
import argparse
import csv
import hashlib
import importlib
import io
import json
import pathlib
import subprocess
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
BINDINGS = [dict(key='KingdomArcaneSanctum', source='ArcaneSanctum', pack='game-ready', model='buildings/Human/ArcaneSanctum/ArcaneSanctum.mdx', building=True), dict(key='ClassicHumanPriest', source='Priest_V1', pack='remaining-ready', model='Units/Human/Priest/Priest_V1.mdx'), dict(key='ClassicHumanSorceress', source='Sorceress_V1', pack='remaining-ready', model='Units/Human/Sorceress/Sorceress_V1.mdx'), dict(key='ClassicHumanSpellbreaker', source='BloodElfSpellThief', pack='game-ready', model='Units/Human/BloodElfSpellThief/BloodElfSpellThief.mdx')]
BINDINGS += [dict(key='Classic' + name, source=name, pack='remaining-ready', model='Abilities/Weapons/' + name + '/' + name + '.mdx', environment=True) for name in ['PriestMissile', 'SorceressMissile', 'BloodElfSpellThiefMISSILE']]


def values(text): return next(csv.reader([text]))
def slot(func): return sum(int(v) * f for v, f in zip(func['Buttonpos'].split(','), [1, 4]))
def requires(func, key='Requires'): return [v for v in func.get(key, '').split(',') if v]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--source-sample', type=pathlib.Path, default=SAMPLE, help='Signed retained MPQ exports for reproduction without an installed game')
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--library', type=pathlib.Path, default=ROOT / 'asset-library/warcraft-iii')
    parser.add_argument('--pose-probe', type=pathlib.Path, required=True)
    parser.add_argument('--metadata-reader', type=pathlib.Path, required=True)
    args = parser.parse_args(); output = args.output.resolve()
    receipt_name = 'human-sanctum-sources.json'; source_root = 'SourceAssets/HumanSanctum/'
    source_receipt = args.source_sample / receipt_name
    retained = json.loads(source_receipt.read_bytes()) if source_receipt.exists() else {}
    previous_path = output / receipt_name
    previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else {}
    files, sources, archives = {}, {}, []
    # MiYu: reject modified signed outputs before conversion or any output writes.
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
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original Sanctum source: ' + path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        sources[path] = record; files[source_root + path] = raw
        return raw

    def icons(name, art):
        result = {}
        for disabled in [False, True]:
            path = art.replace('\\', '/')
            if disabled: path = path.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN').replace('/PassiveButtons/PASBTN', '/CommandButtonsDisabled/DISBTN')
            png = io.BytesIO(); Image.open(io.BytesIO(original(path))).convert('RGBA').save(png, format='PNG')
            key = 'disabledIcon' if disabled else 'icon'; result[key] = 'Assets/Art/classic-sanctum-' + name + ('-disabled' if disabled else '') + '.png'; files[result[key]] = png.getvalue()
        return result

    tables = {name: rows(original('Units/' + name + '.slk')) for name in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'UnitUI', 'UpgradeData', 'AbilityData', 'AbilityMetaData']}
    unit_func, unit_strings, upgrade_func, upgrade_strings, ability_func, ability_strings = [original('Units/' + name + '.txt') for name in ['HumanUnitFunc', 'HumanUnitStrings', 'HumanUpgradeFunc', 'HumanUpgradeStrings', 'HumanAbilityFunc', 'HumanAbilityStrings']]
    editor_strings = dict(line.split('=', 1) for line in original('UI/WorldEditStrings.txt').decode('utf-8').splitlines() if '=' in line and not line.startswith('//'))
    profiles = {}; armor = {'none': 'unarmored', 'medium': 'medium', 'fort': 'fortified'}
    for kind, source, model, label in [('arcanesanctum', 'hars', 'KingdomArcaneSanctum', 'Arcane Sanctum'), ('humanpriest', 'hmpr', 'ClassicHumanPriest', 'Priest'), ('humansorceress', 'hsor', 'ClassicHumanSorceress', 'Sorceress'), ('humanspellbreaker', 'hspt', 'ClassicHumanSpellbreaker', 'Spell Breaker')]:
        b, w, ui, a = [tables[name][source] for name in ['UnitBalance', 'UnitWeapons', 'UnitUI', 'UnitAbilities']]
        func, text = section(unit_func, source), section(unit_strings, source); mobile = source != 'hars'
        d = dict(sourceUnit=source, label=label, model=model, hp=int(b['HP']), armor=armor[b['defType']], armorValue=float(b['def']), gold=int(b['goldcost']), wood=int(b['lumbercost']), food=int(b['fused']) if mobile else 0, time=float(b['bldtm']), speed=float(b['spd']) / 100 if mobile else 0, damage=float(w['avgdmg1']) if mobile else 0, range=float(w['rangeN1']) / 100 if mobile else 0, collision=float(b['collision']) / 100, radius=float(b['collision']) / 100, attack=w['atkType1'], antiAir=mobile and 'air' in w['targs1'].split(','), organic=mobile, healthRegen=float(b['regenHP']) if mobile else 0, sight=float(b['sight']) / 100, nightSight=float(b['nsight']) / 100, abilities=a['abilList'].split(','), autoAbility=a['auto'] if a['auto'] != '_' else None, requires=requires(func), slot=slot(func), hotkey=text['Hotkey'], modelScale=float(ui['modelScale']), selectionScale=float(ui['scale']), sourceRows={name: tables[name][source] for name in ['UnitBalance', 'UnitWeapons', 'UnitUI', 'UnitAbilities']}, sourceFunc=func, sourceStrings=text, **icons(kind, func['Art']))
        if mobile: d.update(mana=int(b['manaN']), initialMana=int(b['mana0']), manaRegen=float(b['regenMana']), cooldown=float(w['cool1']), damagePoint=float(w['dmgpt1']), castPoint=float(w['castpt']), castBackswing=float(w['castbsw']), weaponType=w['weapTp1'], dice=int(w['dice1']), sides=int(w['sides1']), bonus=float(w['dmgplus1']), missileSpeed=float(func['Missilespeed']) / 100, missileArc=float(func['Missilearc']), launch=[float(w['launchX']) / 100, float(w['launchZ']) / 100, -float(w['launchY']) / 100], impactHeight=float(w['impactZ']) / 100)
        profiles[kind] = d
    research = {}
    for key in profiles['arcanesanctum']['sourceFunc']['Researches'].split(','):
        row, func, text = tables['UpgradeData'][key], section(upgrade_func, key), section(upgrade_strings, key)
        count = int(row['maxlevel']); art, names, tips, hotkeys = [values(value) for value in [func['Art'], text['Name'], text['Ubertip'], text['Hotkey']]]
        assert all(len(v) == count for v in [art, names, tips, hotkeys]), key
        effects = [dict(effect=row['effect' + str(i)], base=float(row['base' + str(i)]), increment=float(row['mod' + str(i)])) for i in range(1, 5) if row['effect' + str(i)] != '_']
        levels = [dict(level=i + 1, name=names[i], tooltip=tips[i], hotkey=hotkeys[i], gold=int(row['goldbase']) + i * int(row['goldmod']), wood=int(row['lumberbase']) + i * int(row['lumbermod']), time=float(row['timebase']) + i * float(row['timemod']), requires=requires(func, 'Requires' + (str(i) if i else '')), **icons(key.lower() + '-' + str(i + 1), art[i])) for i in range(count)]
        research[key] = dict(sourceResearch=key, maxLevel=count, slot=slot(func), levels=levels, effects=effects, sourceRow=row, sourceFunc=func, sourceStrings=text)
    abilities = {}
    for key in ['Ahea', 'Adis', 'Ainf', 'Aslo', 'Aivs', 'Aply', 'Afbk', 'Asps', 'Acmg', 'Amim']:
        row = tables['AbilityData'][key]
        if key == 'Amim': func, text = [section(original('Units/NightElfAbility' + name + '.txt'), key) for name in ['Func', 'Strings']]
        else: func, text = section(ability_func, key), section(ability_strings, key)
        metadata = {k: v for k, v in tables['AbilityMetaData'].items() if key in v.get('useSpecific', '').split(',')}
        fields = {v['displayName']: editor_strings[v['displayName']] for v in metadata.values() if v.get('displayName') in editor_strings}
        d = dict(sourceAbility=key, sourceRow=row, sourceFunc=func, sourceStrings=text, sourceMetadata=metadata, sourceFieldLabels=fields, targets=row['targs1'].split(','), cooldown=float(row['Cool1']), manaCost=float(row['Cost1']), duration=float(row['Dur1']), heroDuration=float(row['HeroDur1']), range=float(row['Rng1']) / 100 if row['Rng1'] != '-' else 0, requires=requires(func), requiredLevel=int(func.get('Requiresamount', 1)), passive=key in ['Afbk', 'Amim'])
        if 'Buttonpos' in func: d['slot'] = slot(func)
        if func.get('Art'): d.update(icons(key.lower(), func['Art']))
        if func.get('Unart'): d.update(offIcon=icons(key.lower() + '-off', func['Unart'])['icon'])
        if func.get('Order'): d['order'] = func['Order']
        if func.get('Orderon'): d.update(autoOn=func['Orderon'], autoOff=func['Orderoff'])
        abilities[key] = d
    abilities['Ahea']['healing'] = float(abilities['Ahea']['sourceRow']['DataA1'])
    abilities['Adis'].update(radius=float(abilities['Adis']['sourceRow']['Area1']) / 100, summonedDamage=float(abilities['Adis']['sourceRow']['DataB1']))
    abilities['Ainf'].update(damageBonus=float(abilities['Ainf']['sourceRow']['DataA1']), armorBonus=float(abilities['Ainf']['sourceRow']['DataB1']), autoRange=float(abilities['Ainf']['sourceRow']['DataC1']) / 100, healthRegenBonus=float(abilities['Ainf']['sourceRow']['DataD1']))
    abilities['Aslo'].update(movementReduction=float(abilities['Aslo']['sourceRow']['DataA1']), attackSpeedReduction=float(abilities['Aslo']['sourceRow']['DataB1']))
    abilities['Aivs']['transitionTime'] = float(abilities['Aivs']['sourceRow']['DataA1'])
    abilities['Aply'].update(maxCreepLevel=int(abilities['Aply']['sourceRow']['DataA1']), forms=dict(zip(['ground', 'air', 'amphibious', 'water'], [abilities['Aply']['sourceRow']['Data' + c + '1'] for c in 'BCDE'])))
    abilities['Afbk'].update(manaBurn=float(abilities['Afbk']['sourceRow']['DataA1']), damageRatio=float(abilities['Afbk']['sourceRow']['DataB1']), heroManaBurn=float(abilities['Afbk']['sourceRow']['DataC1']), heroDamageRatio=float(abilities['Afbk']['sourceRow']['DataD1']), summonedDamage=float(abilities['Afbk']['sourceRow']['DataE1']))
    abilities['Asps']['receiverRange'] = float(abilities['Asps']['sourceRow']['Area1']) / 100
    abilities['Acmg'].update(maxCreepLevel=int(abilities['Acmg']['sourceRow']['DataA1']), healthManaRatio=float(abilities['Acmg']['sourceRow']['DataB1']), currentHealthAdjustment=float(abilities['Acmg']['sourceRow']['DataC1']))
    kinds = {d['sourceUnit']: k for k, d in profiles.items()}; roster = [kinds[key] for key in profiles['arcanesanctum']['sourceFunc']['Trains'].split(',')]
    misc = section(original('Units/MiscGame.txt'), 'Misc'); armor_keys = ['light', 'medium', 'heavy', 'fortified', 'normal', 'hero', 'divine', 'unarmored']
    catalog = dict(author='MiYu', sourceUnitsPerWorldUnit=100, sourceVariant='Frozen Throne', units={k: v for k, v in profiles.items() if k != 'arcanesanctum'}, building=profiles['arcanesanctum'], roster=roster, research=research, abilities=abilities, damageTable={kind: dict(zip(armor_keys, map(float, misc['DamageBonus' + kind.capitalize()].split(',')))) for kind in ['normal', 'magic']}, boundAbilityRows={key: tables['AbilityData'][key] for key in sorted({a for d in profiles.values() for a in d['abilities']})})
    files['human-sanctum.json'] = encode(catalog)
    output.parent.mkdir(parents=True, exist_ok=True); (ROOT / 'tmp').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='human-sanctum-', dir=output.parent) as directory:
        work = pathlib.Path(directory); overlay = work / 'overlay'; geometry = work / 'geometry'; geometry.mkdir()
        (geometry / 'model-catalog.json').write_bytes(encode({})); (geometry / 'classic-sources.json').write_bytes(encode(dict(files=[])))
        bindings = work / 'bindings.json'; bindings.write_bytes(encode(dict(models=BINDINGS)))
        nodes = importlib.import_module('convert-frost-classic-billboards'); nodes.LIBRARY = args.library.resolve()
        classic = importlib.import_module('import-frost-classic'); classic.LIBRARY = nodes.LIBRARY
        sys.argv = ['convert-frost-classic-billboards.py', '--bindings', str(bindings), '--output', str(overlay), '--metadata-reader', str(args.metadata_reader)]; nodes.main()
        sys.argv = ['import-frost-classic.py', '--output', str(geometry), '--pose-probe', str(args.pose_probe), '--billboard-library', str(overlay), '--bindings', str(bindings), '--keys', *[b['key'] for b in BINDINGS]]; classic.main()
        remap = lambda path: path.replace('Assets/WarcraftIII/', 'Assets/HumanSanctum/')
        models = json.loads((geometry / 'model-catalog.json').read_bytes())
        for d in profiles.values():
            model = models[d['model']]; height = model['size'][1] * 128 / 100 * d['modelScale']
            model.update(sourceUnit=d['sourceUnit'], sourceModelScale=d['modelScale'], sourceSelectionScale=d['selectionScale'])
            model['maxWorldHeight' if d['sourceUnit'] == 'hars' else 'worldHeight'] = height
        files['human-sanctum-models.json'] = encode(json.loads(remap(json.dumps(models, ensure_ascii=False))))
        geometry_receipt = json.loads((geometry / 'classic-sources.json').read_bytes())
        for record in geometry_receipt['files']:
            path = remap(record['path']); raw = (geometry / record['path']).read_bytes(); assert sha(raw) == record['sha256']
            if path.endswith('.meta'):
                meta = json.loads(raw); meta['guid'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + path[:-5])); raw = encode(meta)
            elif path.endswith(('.mmat', '.json')): raw = remap(raw.decode('utf-8')).encode('utf-8')
            files[path] = raw
        collections = {pack: sha((args.library / pack / 'asset-sources.json').read_bytes()) for pack in sorted({b['pack'] for b in BINDINGS})}
        node_receipt = json.loads((overlay / 'asset-sources.json').read_bytes())
        files['human-sanctum-node-sources.json'] = encode(node_receipt)
        for record in node_receipt['generatedFiles']:
            if record['path'].startswith(('Nodes/', 'Licenses/')): files['SourceAssets/HumanSanctum/Conversion/' + record['path']] = (overlay / record['path']).read_bytes()
    files['Assets/Licenses/Classic-Human-Sanctum.txt'] = b'Arcane Sanctum, Priest, Sorceress, Spell Breaker, Warcraft rules, command icons and source projectiles: Blizzard Entertainment. Original game asset terms apply; these assets are not CC0 or MIT. Converter MIT terms are recorded separately. Archive identities, retained original bytes, selected rows, model collection and converter SHA-256 hashes: human-sanctum-sources.json, human-sanctum-node-sources.json and human-sanctum.json.\n'
    owned = {r['path'] for r in previous.get('files', [])}
    tracked = {}
    if output.is_relative_to(ROOT) and (ROOT / '.git').exists():
        prefix = output.relative_to(ROOT).as_posix() + '/'
        indexed = subprocess.check_output(['git', 'ls-files', '-z', '--', prefix], cwd=ROOT).decode('utf-8').split('\0')
        tracked = {path[len(prefix):].casefold(): path for path in indexed if path}
    for path, raw in files.items():
        target = output / path
        indexed = tracked.get(path.casefold())
        if indexed and path not in owned:
            assert indexed.endswith('/' + path), 'Preserve tracked path spelling: ' + indexed
            assert subprocess.check_output(['git', 'show', ':' + indexed], cwd=ROOT) == raw, 'Preserve tracked output: ' + indexed
        assert not target.exists() or target.read_bytes() == raw or path in owned, 'Preserve unsigned output: ' + path
    generators = ['scripts/import-frost-human-sanctum.py', 'scripts/import-frost-human-army.py', 'scripts/import-frost-classic.py', 'scripts/convert-frost-classic-billboards.py', 'scripts/import-frost-wisp-rules.py', 'scripts/warcraft_mpq.py', 'scripts/warcraft-node-metadata/Program.cs', 'scripts/warcraft-node-metadata/NodeMetadata.csproj']
    receipt = dict(author='MiYu', archivePrecedence=['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'], sources=sorted(sources.values(), key=lambda r: r['path']), models=geometry_receipt['models'], sourceCollections=collections, generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes())) for p in generators], poseProbeSha256=sha(args.pose_probe.read_bytes()), metadataReaderSha256=sha(args.metadata_reader.read_bytes()), files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    for path, raw in files.items():
        target = output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    (output / receipt_name).write_bytes(encode(receipt))
    print('PASS original Arcane Sanctum: three Frozen Throne units, four research tracks, ten abilities and seven animated models')


if __name__ == '__main__': main()

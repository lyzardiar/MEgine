"""Author: MiYu. Reproduce original Orc hero rules and command icons from signed source bytes."""
import argparse
import importlib
import json
import pathlib
import re
from warcraft_mpq import mpyq, read_archive

base = importlib.import_module('import-frost-entangled-assets')
rows = importlib.import_module('import-frost-wisp-rules').rows
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode
HEROES = ['Obla', 'Ofar', 'Otch', 'Oshd']


def section(raw, key):
    try: text = raw.decode('utf-8-sig')
    except UnicodeDecodeError: text = raw.decode('gb18030')
    match = re.search(r'^\[' + re.escape(key) + r'\]\s*\n(.*?)(?=^\[|\Z)', text, re.M | re.S)
    return dict(line.split('=', 1) for line in match[1].splitlines() if '=' in line and not line.startswith('//')) if match else {}


def number(value): return float(value) if value.strip() not in ['', '-', '_'] else 0
def slot(value): return sum(int(v) * multiplier for v, multiplier in zip(value.split(','), [1, 4]))


def main(config=None):
    config = config or {}; race = config.get('race', 'Orc'); heroes = config.get('heroes', HEROES); name = config.get('name', 'orc-hero'); asset_group = config.get('assetGroup', 'OrcHeroes'); altar_id = config.get('altar', 'oalt')
    parser = argparse.ArgumentParser(description=config.get('description', __doc__))
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--source-root', type=pathlib.Path)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); output = args.output.resolve(); source_root = (args.source_root or SAMPLE).resolve()
    receipt_path = source_root / (name + '-sources.json')
    receipt = json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {}
    if args.source_root and not receipt: raise ValueError('Signed ' + race + ' hero source receipt is required')
    signed = {r['path']: r for r in receipt.get('sources', [])}; sources, files, archives = {}, {}, []

    def original(path):
        path = path.replace('\\', '/')
        if path in sources: return files[sources[path]['output']]
        target = 'SourceAssets/' + asset_group + '/raw/' + path
        if signed:
            record = signed.get(path)
            if not record: raise ValueError('Missing signed source: ' + path)
            raw = (source_root / record['output']).read_bytes()
            if len(raw) != record['bytes'] or sha(raw) != record['sha256']: raise ValueError('Source fingerprint mismatch: ' + path)
            archive = record['archive']
        else:
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for archive, mpq in reversed(archives):
                try: raw = read_archive(mpq, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original source: ' + path)
        files[target] = raw; sources[path] = dict(path=path, output=target, archive=archive, bytes=len(raw), sha256=sha(raw))
        return raw

    tables = {n: rows(original('Units/' + n + '.slk')) for n in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'unitUI', 'AbilityData', 'AbilityMetaData', 'AbilityBuffData']}
    texts = {n: original('Units/' + race + n + '.txt') for n in ['UnitFunc', 'UnitStrings', 'AbilityFunc', 'AbilityStrings']}
    common_func = original('Units/CommonAbilityFunc.txt'); misc = section(original('Units/MiscGame.txt'), 'Misc')
    original('Scripts/' + race.lower() + '.ai'); original('Scripts/common.ai')

    def icons(key, path):
        result = {}
        disabled = path.replace('\\CommandButtons\\BTN', '\\CommandButtonsDisabled\\DISBTN').replace('\\PassiveButtons\\PASBTN', '\\CommandButtonsDisabled\\DISPASBTN')
        for field, source in [('icon', path), ('disabledIcon', disabled)]:
            target = 'Assets/' + asset_group + '/Icons/' + key + ('-disabled' if field == 'disabledIcon' else '') + '.png'
            files[target] = base.decode_icon(original(source)); result[field] = target
        return result

    units, abilities, buffs = {}, {}, {}
    for key in heroes:
        b, d, w, a, ui = [tables[n][key] for n in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'unitUI']]
        f, text = section(texts['UnitFunc'], key), section(texts['UnitStrings'], key)
        ability_ids = a['heroAbilList'].split(',')
        units[key] = dict(id=key, name=text['Name'], model=ui['file'], abilityIds=ability_ids, primaryAttribute=b['Primary'], baseHp=number(b['HP']), baseMana=number(b['manaN']), strength=number(b['STR']), agility=number(b['AGI']), intelligence=number(b['INT']), strengthGrowth=number(b['STRplus']), agilityGrowth=number(b['AGIplus']), intelligenceGrowth=number(b['INTplus']), baseArmor=number(b['def']), speed=number(b['spd']) / 100, collision=number(b['collision']) / 100, daySight=number(b['sight']) / 100, nightSight=number(b['nsight']) / 100, healthRegen=number(b['regenHP']), manaRegen=number(b['regenMana']), gold=number(b['goldcost']), wood=number(b['lumbercost']), food=number(b['fused']), time=number(b['bldtm']), modelScale=number(ui['modelScale']), selectionScale=number(ui['scale']), sourceRows={n: tables[n][key] for n in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'unitUI']}, sourceFunc=f, sourceStrings=text, **icons(key, f['Art']))
        for ability in ability_ids:
            if ability in abilities: raise ValueError('Unexpected shared hero skill: ' + ability)
            r, af, ast = tables['AbilityData'][ability], section(texts['AbilityFunc'], ability), section(texts['AbilityStrings'], ability)
            levels = []
            for rank in range(1, int(r['levels']) + 1):
                get = lambda name: number(r[name + str(rank)])
                levels.append(dict(rank=rank, cost=get('Cost'), cooldown=get('Cool'), castTime=get('Cast'), range=get('Rng') / 100, radius=get('Area') / 100, duration=get('Dur'), heroDuration=get('HeroDur'), data={c: r[c + str(rank)] for c in ['DataA', 'DataB', 'DataC', 'DataD', 'DataE', 'DataF'] if c + str(rank) in r}, targets=r.get('targs' + str(rank), ''), buffs=r.get('BuffID' + str(rank), '').split(',')))
            abilities[ability] = dict(id=ability, owner=key, name=ast['Name'], slot=slot(af['Buttonpos']), researchSlot=slot(af['Researchbuttonpos']), requiredLevel=number(r['reqLevel']), levelSkip=number(r['levelSkip']), levels=levels, sourceRow=r, sourceFunc=af, sourceStrings=ast, **icons(ability, af['Art']))
            if af.get('Researchart'): abilities[ability]['research'] = icons(ability + '-research', af['Researchart'])
            for level in levels:
                for buff in level['buffs']:
                    if buff not in ['', '_', '-'] and buff not in buffs:
                        aliases = [key for key in tables['AbilityBuffData'] if key.lower() == buff.lower()] if buff not in tables['AbilityBuffData'] else [buff]
                        if len(aliases) != 1: raise ValueError('Unresolved original buff reference: ' + buff)
                        alias = aliases[0]; buffs[buff] = dict(sourceRow=tables['AbilityBuffData'][alias], sourceFunc=section(texts['AbilityFunc'], buff) or section(texts['AbilityFunc'], alias) or section(common_func, buff) or section(common_func, alias))
                        if alias != buff: buffs[buff]['sourceAlias'] = alias
        units[key]['commandOrder'] = sorted(ability_ids, key=lambda k: abilities[k]['researchSlot'])
    altar = dict(sourceRows={n: tables[n][altar_id] for n in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'unitUI']}, sourceFunc=section(texts['UnitFunc'], altar_id), sourceStrings=section(texts['UnitStrings'], altar_id))
    files[name + '-rules.json'] = encode(dict(author='MiYu',schemaVersion=1,heroes=heroes,units=units,abilities=abilities,buffs=buffs,altar=altar,misc=misc,originalRuntimeVerified=False,runtimeIntegrated=False,scope='Original four ' + race + ' hero attributes, exact skill bindings and source level fields, command cards, disabled/research icons, buff records and AI scripts. Hero geometry and playable abilities are separate integration stages.'))
    files['Assets/' + asset_group + '/.gitattributes'] = b'* -text whitespace=cr-at-eol\n'
    files['SourceAssets/' + asset_group + '/.gitattributes'] = b'* -text whitespace=cr-at-eol,-blank-at-eol,-blank-at-eof\n'
    files['Assets/Licenses/Classic-' + race + '-Heroes.txt'] = ('Original Warcraft III rules and icons belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source archives, hashes and generator: ' + name + '-sources.json.\n').encode()
    previous_path = output / (name + '-sources.json')
    previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else {}
    for record in previous.get('outputs', []):
        target = output / record['path']
        if not target.exists() or sha(target.read_bytes()) != record['sha256']: raise ValueError('Modified generated output: ' + record['path'])
    for path, raw in files.items():
        target = output / path
        if target.exists() and path not in {r['path'] for r in previous.get('outputs', [])} and target.read_bytes() != raw: raise ValueError('Unowned output collision: ' + path)
    tools = ['scripts/import-frost-orc-heroes.py','scripts/import-frost-entangled-assets.py','scripts/import-frost-wisp-rules.py','scripts/warcraft_mpq.py'] + config.get('generators', [])
    manifest = dict(author='MiYu',sources=list(sources.values()),outputs=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in files.items()],generators=[dict(path=p,sha256=sha((ROOT / p).read_bytes())) for p in tools],originalRuntimeVerified=False,runtimeIntegrated=False)
    for path, raw in files.items():
        target = output / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(raw)
    output.mkdir(parents=True, exist_ok=True); (output / (name + '-sources.json')).write_bytes(encode(manifest))
    print('Imported four ' + race + ' heroes:', len(abilities), 'skills,', sum(len(a['levels']) for a in abilities.values()), 'skill ranks,', len(sources), 'source files,', len(files), 'signed outputs')


if __name__ == '__main__': main()

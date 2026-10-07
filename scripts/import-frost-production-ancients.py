"""Author: MiYu. Import original production Ancient balance, form weapons and Root/Eat Tree commands."""
import argparse
import importlib
import json
import pathlib
from warcraft_mpq import mpyq, read_archive

base = importlib.import_module('import-frost-entangled-assets')
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-natures-blessing').section
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); output = args.output.resolve()
    receipt = SAMPLE / 'production-ancient-sources.json'
    previous = json.loads(receipt.read_bytes()) if receipt.exists() else {}
    files, sources, archives = {}, [], []
    def original(path):
        record = next((r for r in previous.get('sources', []) if r['path'] == path), None)
        if record:
            raw = (SAMPLE / 'SourceAssets/WarcraftIII' / path).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], path
        else:
            if not archives: archives.extend((name, mpyq.MPQArchive(str(args.game / name))) for name in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original Ancient source: ' + path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        files['SourceAssets/WarcraftIII/' + path] = raw; sources.append(record)
        return raw
    selected = {name: rows(original('Units/' + name + '.slk')) for name in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'AbilityData']}
    art = original('Units/NightElfAbilityFunc.txt'); strings = original('Units/NightElfAbilityStrings.txt')
    ability = selected['AbilityData']; units = {}
    for kind, source, name in [('barracks', 'eaom', 'Ancient of War'), ('tower', 'etrp', 'Ancient Protector'), ('shop', 'eden', 'Ancient of Wonders')]:
        b, w, a = [selected[key][source] for key in ['UnitBalance', 'UnitWeapons', 'UnitAbilities']]
        root_id = next(k for k in a['abilList'].split(',') if k in ['Aro1', 'Aro2']); root = ability[root_id]
        assert root['DataC1'] == '0' and root['DataD1'] == '2' and b['regenType'] == 'night'
        weapons = {}
        for form, slot in [('rooted', root['DataA1']), ('uprooted', root['DataB1'])]:
            weapons[form] = dict(slot=int(slot), damage=float(w['avgdmg' + slot]), range=float(w['rangeN' + slot]) / 100, cooldown=float(w['cool' + slot]), attack=w['atkType' + slot], antiAir='air' in w['targs' + slot].split(','), weaponType=w['weapTp' + slot])
            if w['weapTp' + slot] == 'msplash': weapons[form]['splashBands'] = [[float(w[k + 'area' + slot]) / 100, factor] for k, factor in [('F', 1), ('H', float(w['Hfact' + slot])), ('Q', float(w['Qfact' + slot]))]]
        units[kind] = dict(sourceUnit=source, name=name, hp=int(b['HP']), armorValue=float(b['def']), armorBonus=float(b['defUp']), speed=float(b['spd']) / 100, nightRegen=float(b['regenHP']), gold=int(b['goldcost']), wood=int(b['lumbercost']), time=float(b['bldtm']), morph=float(root['Dur1']), weapons=weapons, sourceRows={key: selected[key][source] for key in ['UnitBalance', 'UnitWeapons', 'UnitAbilities']}, sourceRoot=root)
    commands = {'root': (section(art, 'Aroo'), section(strings, 'Aroo')), 'eatTree': (section(art, 'Aeat'), section(strings, 'Aeat'))}
    assert commands['root'][0]['Buttonpos'] == '3,2' and commands['eatTree'][0]['Buttonpos'] == '0,2'
    for key, path in [('root', commands['root'][0]['Art']), ('uproot', commands['root'][0]['Unart']), ('eat-tree', commands['eatTree'][0]['Art'])]:
        files['Assets/Art/classic-' + key + '.png'] = base.decode_icon(original(path.replace('\\', '/')))
    catalog = dict(author='MiYu', sourceUnitsPerWorldUnit=100, units=units, commands={k: dict(art=a, strings=s) for k, (a, s) in commands.items()}, eatTree=ability['Aeat'])
    files['production-ancients.json'] = encode(catalog)
    files['Assets/Licenses/Classic-Production-Ancients.txt'] = b'Ancient unit/ability data and Root/Uproot/Eat Tree icons: Blizzard Entertainment, original Warcraft III game asset terms apply. Archive paths, hashes and selected rows are in production-ancient-sources.json and production-ancients.json.\n'
    old = {r['path']: r['sha256'] for r in previous.get('files', [])}
    for relative, raw in files.items():
        target = output / relative
        if target.exists() and target.read_bytes() != raw: assert sha(target.read_bytes()) == old.get(relative), 'Preserve modified Ancient output: ' + relative
    for relative, raw in files.items():
        target = output / relative; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    generator = 'scripts/import-frost-production-ancients.py'
    result = dict(author='MiYu', generator=generator, generatorSha256=sha((ROOT / generator).read_bytes()), sources=sources, files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    (output / 'production-ancient-sources.json').write_bytes(encode(result))
    print('PASS original production Ancients:', len(units), 'source units, form weapons, armor, full construction and command icons')


if __name__ == '__main__': main()

"""Author: MiYu. Reproduce Ancient of War unit rules and original training icons from Warcraft archives."""
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
    receipt = SAMPLE / 'ancient-war-sources.json'
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
            else: raise ValueError('Missing original Ancient of War source: ' + path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        files['SourceAssets/WarcraftIII/' + path] = raw; sources.append(record)
        return raw
    selected = {name: rows(original('Units/' + name + '.slk')) for name in ['UnitBalance', 'UnitWeapons', 'UnitAbilities']}
    func, strings = original('Units/NightElfUnitFunc.txt'), original('Units/NightElfUnitStrings.txt')
    units, armor = {}, {'medium': 'medium', 'none': 'unarmored', 'large': 'heavy', 'fort': 'fortified'}
    for kind, source, label, model, art in [('nightarcher', 'earc', 'Archer', 'RealArcher', 'night-arrow'), ('nighthuntress', 'esen', 'Huntress', 'ClassicHuntress', 'moon-glaive'), ('glaivethrower', 'ebal', 'Glaive Thrower', 'ClassicGlaiveThrower', 'glaive')]:
        b, w, a = [selected[key][source] for key in ['UnitBalance', 'UnitWeapons', 'UnitAbilities']]
        ui, text = section(func, source), section(strings, source)
        unit = dict(sourceUnit=source, label=label, model=model, hp=int(b['HP']), armor=armor[b['defType']], armorValue=float(b['def']), gold=int(b['goldcost']), wood=int(b['lumbercost']), food=int(b['fused']), time=float(b['bldtm']), damage=float(w['avgdmg1']), attack=w['atkType1'], range=float(w['rangeN1']) / 100, cooldown=float(w['cool1']), speed=float(b['spd']) / 100, collision=float(b['collision']) / 100, antiAir='air' in w['targs1'].split(','), mechanical=source == 'ebal', nightRegen=float(b['regenHP']) if b['regenHP'] != '-' else 0, projectile=art, missileSpeed=float(ui['Missilespeed']) / 100, missileArc=float(ui['Missilearc']), requires=ui.get('Requires', ''), slot=sum(int(v) * factor for v, factor in zip(ui['Buttonpos'].split(','), [1, 4])), hotkey=text['Hotkey'], sourceRows={key: selected[key][source] for key in selected}, sourceFunc=ui, sourceStrings=text)
        unit.update(damagePoint=float(w['dmgpt1']), launch=[float(w['launchX']) / 100, float(w['launchZ']) / 100, -float(w['launchY']) / 100])
        if source == 'esen': unit.update(bounceTargets=int(w['targCount1']), bounceRadius=float(w['Farea1']) / 100, bounceLoss=float(w['damageLoss1']))
        if source == 'ebal': unit.update(minRange=float(w['minRange']) / 100, splashBands=[[float(w[k + 'area1']) / 100, factor] for k, factor in [('F', 1), ('H', float(w['Hfact1'])), ('Q', float(w['Qfact1']))]], splashEnemiesOnly='enemy' in w['splashTargs1'].split(','))
        for disabled, prefix in [(False, 'CommandButtons'), (True, 'CommandButtonsDisabled')]:
            path = ui['Art'].replace('\\', '/')
            if disabled: path = path.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
            files['Assets/Art/classic-' + kind + ('-disabled' if disabled else '') + '.png'] = base.decode_icon(original(path))
        units[kind] = unit
    b = selected['UnitBalance']['edob']
    hall = dict(sourceUnit='edob', label="Hunter's Hall", hp=int(b['HP']), armor='fortified', armorValue=float(b['def']), gold=int(b['goldcost']), wood=int(b['lumbercost']), time=float(b['bldtm']), sourceRows={key: selected[key]['edob'] for key in selected}, sourceFunc=section(func, 'edob'))
    misc = section(original('Units/MiscGame.txt'), 'Misc')
    targetArmor = ['light', 'medium', 'heavy', 'fortified', 'normal', 'hero', 'divine', 'unarmored']
    damageTable = {kind: dict(zip(targetArmor, map(float, misc['DamageBonus' + kind.capitalize()].split(',')))) for kind in ['normal', 'pierce', 'siege']}
    catalog = dict(author='MiYu', sourceUnitsPerWorldUnit=100, units=units, huntersHall=hall, damageTable=damageTable, production=section(func, 'eaom'))
    files['ancient-war.json'] = encode(catalog)
    files['Assets/Licenses/Classic-Ancient-War.txt'] = b'Ancient of War unit rules and training icons: Blizzard Entertainment, original Warcraft III game asset terms apply. Archive paths, hashes and selected rows: ancient-war-sources.json and ancient-war.json.\n'
    old = {r['path']: r['sha256'] for r in previous.get('files', [])}
    for relative, raw in files.items():
        target = output / relative
        if target.exists() and target.read_bytes() != raw: assert sha(target.read_bytes()) == old.get(relative), 'Preserve modified Ancient of War output: ' + relative
    for relative, raw in files.items():
        target = output / relative; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    generator = 'scripts/import-frost-ancient-war.py'
    (output / 'ancient-war-sources.json').write_bytes(encode(dict(author='MiYu', generator=generator, generatorSha256=sha((ROOT / generator).read_bytes()), sources=sources, files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])))
    print('PASS original Ancient of War: 3 units, Hunter\'s Hall, source projectile rules and six original icons')


if __name__ == '__main__': main()

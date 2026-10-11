"""Author: MiYu. Preserve original Blacksmith research ranks, unit stat bindings and source command icons."""
import argparse
import hashlib
import importlib
import io
import json
import pathlib
import sys
from PIL import Image
from warcraft_mpq import mpyq, read_archive

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-human-army').section
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); output = args.output.resolve()
    previous_path = SAMPLE / 'human-equipment-sources.json'
    previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else {}
    sources, files, archives = {}, {}, []

    def original(path):
        if path in sources: return files['SourceAssets/HumanEquipment/' + path]
        record = next((r for r in previous.get('sources', []) if r['path'] == path), None)
        if record:
            raw = (SAMPLE / 'SourceAssets/HumanEquipment' / path).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], path
        else:
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing human technology source: ' + path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        sources[path] = record; files['SourceAssets/HumanEquipment/' + path] = raw
        return raw

    def icons(name, path):
        refs = {}
        for disabled in [False, True]:
            source = path.replace('\\', '/')
            if disabled: source = source.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
            png = io.BytesIO(); Image.open(io.BytesIO(original(source))).convert('RGBA').save(png, format='PNG')
            key = 'disabledIcon' if disabled else 'icon'; refs[key] = 'Assets/Art/classic-' + name + ('-disabled' if disabled else '') + '.png'; files[refs[key]] = png.getvalue()
        return refs

    import csv
    ranks = lambda value: next(csv.reader([value]))
    upgrade, balance, weapons, effect_meta = [rows(original('Units/' + name + '.slk')) for name in ['UpgradeData', 'UnitBalance', 'UnitWeapons', 'UpgradeEffectMetaData']]
    func, strings, unit_func = [original('Units/' + name + '.txt') for name in ['HumanUpgradeFunc', 'HumanUpgradeStrings', 'HumanUnitFunc']]
    keys = section(unit_func, 'hbla')['Researches'].split(',')
    assert keys == ['Rhme', 'Rhar', 'Rhla', 'Rhra']
    research = {}
    for key in keys:
        row, art, text = upgrade[key], section(func, key), section(strings, key)
        assert row['maxlevel'] == art['Requirescount'] == '3'
        names, hotkeys, tips, tooltips, images = [ranks(value) for value in [text['Name'], text['Hotkey'], text['Tip'], text['Ubertip'], art['Art']]]
        assert all(len(value) == 3 for value in [names, hotkeys, tips, tooltips, images])
        levels = []
        for n in range(3):
            requires = art.get('Requires' + (str(n) if n else ''), '')
            levels.append(dict(rank=n+1, name=names[n], hotkey=hotkeys[n], tip=tips[n], tooltip=tooltips[n], gold=int(row['goldbase'])+n*int(row['goldmod']), wood=int(row['lumberbase'])+n*int(row['lumbermod']), time=float(row['timebase'])+n*float(row['timemod']), requires=requires.split(',') if requires else [], attackDice=float(row['base1'])+n*float(row['mod1']) if row['effect1']=='ratd' else 0, **icons(key.lower()+'-'+str(n+1),images[n])))
        research[key] = dict(building='hbla', maxLevel=3, slot=sum(int(v)*f for v,f in zip(art['Buttonpos'].split(','),[1,4])), levels=levels, affectedUnits=sorted(k for k,v in balance.items() if key in v.get('upgrades','').split(',')), sourceRow=row, sourceFunc=art, sourceStrings=text, sourceEffectMetadata={k:v for k,v in effect_meta.items() if v['effectID']==row['effect1']})
    bindings = {'humanfootman':'hfoo','humanrifleman':'hrif','humanknight':'hkni'}
    unit_profiles = {}
    for source in sorted({k for r in research.values() for k in r['affectedUnits']}):
        b,w = balance[source], weapons[source]
        unit_profiles[source] = dict(upgrades=[k for k in b['upgrades'].split(',') if k in research], armorPerRank=float(b['defUp']), averageDiceDamage=(float(w['sides1'])+1)/2, sourceRows=dict(UnitBalance=b,UnitWeapons=w))
    catalog = dict(author='MiYu', research=research, unitBindings=bindings, units=unit_profiles, buildingSourceFunc=section(unit_func,'hbla'), references={'blacksmith':'https://classic.battle.net/war3/human/buildings/blacksmith.shtml'})
    files['human-equipment.json'] = encode(catalog)
    files['Assets/Licenses/Classic-Human-Equipment.txt'] = b'Warcraft III Blacksmith upgrades, source unit bindings and icons: Blizzard Entertainment. Original game terms apply. Sources, selected rows, archive identities and SHA-256: human-equipment-sources.json and human-equipment.json.\n'
    old = {r['path']:r['sha256'] for r in previous.get('files',[])}
    for path,raw in files.items():
        p=output/path
        if p.exists() and p.read_bytes()!=raw: assert sha(p.read_bytes())==old.get(path), 'Preserve edited output: '+path
    for path,raw in files.items():
        p=output/path; p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(raw)
    generators=['scripts/import-frost-human-equipment.py','scripts/import-frost-human-army.py','scripts/import-frost-wisp-rules.py']
    receipt=dict(author='MiYu',sources=sorted(sources.values(),key=lambda r:r['path']),generators=[dict(path=p,sha256=sha((ROOT/p).read_bytes())) for p in generators],files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())])
    (output/'human-equipment-sources.json').write_bytes(encode(receipt));print('PASS original human Blacksmith equipment: four research profiles/twelve ranks, unit bindings and 24 source icons')


if __name__ == '__main__': main()

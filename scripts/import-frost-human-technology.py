"""Author: MiYu. Preserve original Barracks research, Defend rules and source command icons."""
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
    previous_path = SAMPLE / 'human-technology-sources.json'
    previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else {}
    sources, files, archives = {}, {}, []

    def original(path):
        if path in sources: return files['SourceAssets/HumanTechnology/' + path]
        record = next((r for r in previous.get('sources', []) if r['path'] == path), None)
        if record:
            raw = (SAMPLE / 'SourceAssets/HumanTechnology' / path).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], path
        else:
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing human technology source: ' + path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        sources[path] = record; files['SourceAssets/HumanTechnology/' + path] = raw
        return raw

    def icons(name, path):
        refs = {}
        for disabled in [False, True]:
            source = path.replace('\\', '/')
            if disabled: source = source.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
            png = io.BytesIO(); Image.open(io.BytesIO(original(source))).convert('RGBA').save(png, format='PNG')
            key = 'disabledIcon' if disabled else 'icon'; refs[key] = 'Assets/Art/classic-' + name + ('-disabled' if disabled else '') + '.png'; files[refs[key]] = png.getvalue()
        return refs

    upgrade, abilities, metadata, units = [rows(original('Units/' + name + '.slk')) for name in ['UpgradeData', 'AbilityData', 'AbilityMetaData', 'UnitAbilities']]
    func, strings, ability_func, ability_strings = [original('Units/' + name + '.txt') for name in ['HumanUpgradeFunc', 'HumanUpgradeStrings', 'HumanAbilityFunc', 'HumanAbilityStrings']]
    research = {}
    for key, name in [('Rhde', 'Defend'), ('Rhri', 'Long Rifles'), ('Rhan', 'Animal War Training')]:
        row, art, text = upgrade[key], section(func, key), section(strings, key)
        assert row['maxlevel'] == '1'
        research[key] = dict(name=name, gold=int(row['goldbase']), wood=int(row['lumberbase']), time=float(row['timebase']), slot=sum(int(v) * f for v, f in zip(art['Buttonpos'].split(','), [1, 4])), hotkey=text['Hotkey'], requires=art.get('Requires', '').split(',') if art.get('Requires') else [], sourceRow=row, sourceFunc=art, sourceStrings=text, **icons(key.lower(), art['Art']))
    row, art, text = abilities['Adef'], section(ability_func, 'Adef'), section(ability_strings, 'Adef')
    defend = dict(sourceAbility='Adef', sourceRow=row, sourceFunc=art, sourceStrings=text, incomingPiercingFactor=float(row['DataA1']), outgoingFactor=float(row['DataB1']), movementMultiplier=1-float(row['DataC1']), reflectChance=float(row['DataF1'])/100, reflectedPiercingFactor=float(row['DataG1']), reflectedMagicFactor=float(row['DataH1']), slot=sum(int(v)*f for v,f in zip(art['Buttonpos'].split(','), [1,4])), hotkey=text['Hotkey'], **icons('defend', art['Art']), offIcon=icons('undefend', art['Unart'])['icon'], metadata={k:v for k,v in metadata.items() if 'Adef' in v.get('useSpecific','')})
    bindings = {'humanfootman':'hfoo', 'humanrifleman':'hrif', 'humanknight':'hkni'}
    assert 'Adef' in units['hfoo']['abilList'].split(',')
    catalog = dict(author='MiYu', research=research, defend=defend, rangeBonus=float(upgrade['Rhri']['base1'])/100, healthBonus=float(upgrade['Rhan']['base1']), unitBindings=bindings, unitAbilityRows={v:units[v] for v in bindings.values()}, references={'defend':'https://classic.battle.net/war3/human/units/footman.shtml'}, interpretations={'movement':'Defend reduces movement speed by DataC1; buildings cannot reflect, piercing unit attacks have DataF1 percent reflection chance.'})
    files['human-technology.json'] = encode(catalog)
    files['Assets/Licenses/Classic-Human-Technology.txt'] = b'Warcraft III Barracks upgrades, Defend ability and icons: Blizzard Entertainment. Original game terms apply. Sources, selected source rows, archive identities and SHA-256: human-technology-sources.json and human-technology.json.\n'
    old = {r['path']:r['sha256'] for r in previous.get('files',[])}
    for path,raw in files.items():
        p=output/path
        if p.exists() and p.read_bytes()!=raw: assert sha(p.read_bytes())==old.get(path), 'Preserve edited output: '+path
    for path,raw in files.items():
        p=output/path; p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(raw)
    generators=['scripts/import-frost-human-technology.py','scripts/import-frost-human-army.py','scripts/import-frost-wisp-rules.py']
    receipt=dict(author='MiYu',sources=sorted(sources.values(),key=lambda r:r['path']),generators=[dict(path=p,sha256=sha((ROOT/p).read_bytes())) for p in generators],files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())])
    (output/'human-technology-sources.json').write_bytes(encode(receipt));print('PASS original human Barracks technology: three research profiles, Defend ability/metadata and ten source icons')


if __name__ == '__main__': main()

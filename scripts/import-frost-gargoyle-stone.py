"""Author: MiYu. Reproduce original Gargoyle Stone Form data, source field metadata and command textures."""
import argparse
import hashlib
import importlib
import io
import json
from pathlib import Path
import uuid
from PIL import Image
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-human-army').section
slot = importlib.import_module('import-frost-human-sanctum').slot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--source-sample', type=Path, default=SAMPLE)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    args = parser.parse_args()
    receipt = 'gargoyle-stone-sources.json'; source_root = 'SourceAssets/GargoyleStone/'
    previous = json.loads((args.output / receipt).read_bytes()) if (args.output / receipt).exists() else {}
    retained = json.loads((args.source_sample / receipt).read_bytes()) if (args.source_sample / receipt).exists() else {}
    files, sources, archives = {}, {}, []
    for record in previous.get('files', []):
        raw = (args.output / record['path']).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Preserve edited output: ' + record['path']

    def original(path):
        path = path.replace('\\', '/')
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
            record = dict(path=path, archivePath=path, archive=name, bytes=len(raw), sha256=sha(raw))
        sources[path] = record; files[source_root + path] = raw
        return raw

    def icons(name, art):
        result = {}
        for disabled in [False, True]:
            path = art.replace('\\', '/')
            if disabled: path = path.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN').replace('/PassiveButtons/PASBTN', '/CommandButtonsDisabled/DISPASBTN')
            stream = io.BytesIO(); Image.open(io.BytesIO(original(path))).convert('RGBA').save(stream, format='PNG')
            key = 'disabledIcon' if disabled else 'icon'; target = 'Assets/Art/classic-gargoyle-stone' + name + ('-disabled' if disabled else '') + '.png'
            files[target] = stream.getvalue(); result[key] = target
            files[target + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + target)), importer='texture'))
        return result

    ability_rows = rows(original('Units/AbilityData.slk'))
    ability = ability_rows['Astn']
    func, strings = [section(original('Units/UndeadAbility' + name + '.txt'), 'Astn') for name in ['Func', 'Strings']]
    research = rows(original('Units/UpgradeData.slk'))['Rusf']
    rfunc, rstrings = [section(original('Units/UndeadUpgrade' + name + '.txt'), 'Rusf') for name in ['Func', 'Strings']]
    metadata = rows(original('Units/AbilityMetaData.slk'))
    generic = {'atar', 'acas', 'adur', 'ahdu', 'acdn', 'amcs', 'aare', 'aran'}
    metadata = {key: value for key, value in metadata.items() if key in generic or {'Astn', 'ACmi'} & set(value.get('useSpecific', '').split(','))}
    editor_strings = dict(line.split('=', 1) for line in original('UI/WorldEditStrings.txt').decode('utf-8').splitlines() if '=' in line and not line.startswith('//'))
    morph_flags = section(original('UI/UnitEditorData.txt'), 'morphFlags')
    labels = {value['displayName']: editor_strings[value['displayName']] for value in metadata.values()}
    flag_labels = {key: value for key, value in editor_strings.items() if key.startswith('WESTRING_UE_MORPHFLAGS_')}
    tables = {name: rows(original('Units/' + name + '.slk')) for name in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'UnitUI']}
    unit_func, unit_strings = [original('Units/UndeadUnit' + name + '.txt') for name in ['Func', 'Strings']]
    units = {}
    for key in ['ugar', 'ugrm']:
        source_rows = {name: table[key] for name, table in tables.items()}; b, d, w, a, ui = [source_rows[name] for name in tables]
        ufunc, ustrings = section(unit_func, key), section(unit_strings, key)
        speed = 0 if b['spd'].strip() == '-' else float(b['spd'])/100
        units[key] = dict(sourceUnit=key, name=ustrings['Name'], hp=int(b['HP']), speed=speed, armorValue=float(b['def']), armorUpgrade=float(b['defUp']), armor=b['defType'], collision=float(b['collision'])/100, healthRegen=float(b['regenHP']), regenerationType=b['regenType'], movementType=d['movetp'], targetTypes=d['targType'].split(','), moveHeight=float(d['moveHeight'])/100, moveFloor=float(d['moveFloor'])/100, weaponsEnabled=int(w['weapsOn']), castPoint=float(w['castpt']), castBackswing=float(w['castbsw']), model=ui['file'], modelScale=float(ui['modelScale']), selectionScale=float(ui['scale']), selectionHeight=float(ui['selZ'])/100, abilities=a['abilList'].split(','), attachmentAnimProps=ufunc.get('Attachmentanimprops', '').split(','), attachmentLinkProps=[v for v in ufunc.get('Attachmentlinkprops', '').split(',') if v], sourceRows=source_rows, sourceFunc=ufunc, sourceStrings=ustrings)
    skill = dict(id='Astn', name=strings['Name'], castTime=float(ability['Cast1']), duration=float(ability['Dur1']), heroDuration=float(ability['HeroDur1']), mana=float(ability['Cost1']), cooldown=float(ability['Cool1']), normalUnit=ability['DataA1'], alternateUnit=ability['UnitID1'], morphFlags=int(ability['DataB1']), heightAdjustmentTime=float(ability['DataC1']), landingDelay=float(ability['DataD1']), regenerationRate=float(ability['DataE1']), requires=func['Requires'].split(','), slot=slot(func), unSlot=slot(dict(Buttonpos=func['Unbuttonpos'])), hotkey=strings['Hotkey'], unhotkey=strings['Unhotkey'], order=func['Order'], unorder=func['Unorder'], sourceRow=ability, sourceFunc=func, sourceStrings=strings, sourceFieldLabels=labels, **icons('', func['Art']))
    skill['unicons'] = icons('-unstone', func['Unart'])
    upgrade = dict(id='Rusf', name=rstrings['Name'], gold=int(research['goldbase']), wood=int(research['lumberbase']), time=float(research['timebase']), requires=rfunc['Requires'].split(','), slot=slot(rfunc), hotkey=rstrings['Hotkey'], tooltip=rstrings['Ubertip'].strip('"'), sourceRow=research, sourceFunc=rfunc, sourceStrings=rstrings, **icons('-research', rfunc['Art']))
    ifunc, istrings = [section(original('Units/NeutralAbility' + name + '.txt'), 'ACmi') for name in ['Func', 'Strings']]
    immunity = dict(id='ACmi', code=ability_rows['ACmi']['code'], name=istrings['Name'], damageFactor=float(ability_rows['ACmi']['DataA1']), slot=slot(ifunc), sourceRow=ability_rows['ACmi'], sourceFunc=ifunc, sourceStrings=istrings, **icons('-immunity', ifunc['Art']))
    files['gargoyle-stone.json'] = encode(dict(author='MiYu', sourceUnitsPerWorldUnit=100, ability=skill, research=upgrade, units=units, magicImmunity=immunity, metadata=metadata, morphFlags=dict(sourceFile='UI/UnitEditorData.txt', sourceSection='morphFlags', sourceFields=morph_flags, sourceLabels=flag_labels)))
    files['Assets/Licenses/Classic-Gargoyle-Stone.txt'] = b'Original Warcraft III Gargoyle Stone Form data and command textures: Blizzard Entertainment original game asset terms apply. MPQ paths and SHA-256 are retained in gargoyle-stone-sources.json. Extraction does not grant redistribution rights.\n'
    for _, archive in archives: archive.file.close()
    for path, raw in files.items():
        target = args.output / path
        if target.exists() and target.read_bytes() != raw: assert any(r['path'] == path and r['sha256'] == sha(target.read_bytes()) for r in previous.get('files', [])), 'Preserve edited output: ' + path
    for path, raw in files.items():
        target = args.output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    manifest = dict(author='MiYu', generator='scripts/import-frost-gargoyle-stone.py', generatorSha256=sha(Path(__file__).read_bytes()), gameDirectory=retained.get('gameDirectory', str(args.game)), reaSource='https://github.com/morluto/rea', reaVersion='6.5.0', reaEvidence='tmp/docs-artifacts/frost-gargoyle-stone/', sources=list(sources.values()), files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p,raw in files.items()], originalRuntimeVerified=False, license='Blizzard Entertainment original game terms')
    (args.output / receipt).write_bytes(encode(manifest))
    print('PASS source Stone Form: ability, research, both unit forms, immunity, metadata and ' + str(len(files)) + ' signed outputs')


if __name__ == '__main__': main()

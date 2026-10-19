"""Author: MiYu. Reproduce original Crypt Fiend Burrow research, alternate body and command art."""
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
    receipt = 'crypt-burrow-sources.json'; source_root = 'SourceAssets/CryptBurrow/'
    previous = json.loads((args.output / receipt).read_bytes()) if (args.output / receipt).exists() else {}
    retained = json.loads((args.source_sample / receipt).read_bytes()) if (args.source_sample / receipt).exists() else {}
    files, sources, archives = {}, {}, []
    for record in previous.get('files', []):
        raw = (args.output / record['path']).read_bytes()
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
            stream = io.BytesIO(); Image.open(io.BytesIO(original(path))).convert('RGBA').save(stream, format='PNG')
            key = 'disabledIcon' if disabled else 'icon'; target = 'Assets/Art/classic-crypt-' + name + ('-disabled' if disabled else '') + '.png'
            files[target] = stream.getvalue(); result[key] = target
            files[target + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + target)), importer='texture'))
        return result

    ability = rows(original('Units/AbilityData.slk'))['Abur']
    func, strings = [section(original('Units/UndeadAbility' + name + '.txt'), 'Abur') for name in ['Func', 'Strings']]
    research = rows(original('Units/UpgradeData.slk'))['Rubu']
    rfunc, rstrings = [section(original('Units/UndeadUpgrade' + name + '.txt'), 'Rubu') for name in ['Func', 'Strings']]
    source_rows = {name: rows(original('Units/' + name + '.slk'))['ucrm'] for name in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'UnitUI']}
    b = source_rows['UnitBalance']; w = source_rows['UnitWeapons']
    form = dict(sourceUnit='ucrm', hp=int(b['HP']), speed=0, damage=0, armorValue=float(b['def']), collision=float(b['collision'])/100, healthRegen=float(b['regenHP']), regenerationType=b['regenType'], acquisition=float(w['acquire'])/100, sourceRows=source_rows)
    metadata = rows(original('Units/AbilityMetaData.slk'))
    skill = dict(id='Abur', duration=float(ability['Dur1']), mana=float(ability['Cost1']), cooldown=float(ability['Cool1']), sourceRow=ability, sourceFunc=func, sourceStrings=strings, slot=slot(func), hotkey=strings['Hotkey'], **icons('burrow', func['Art']))
    skill['unicons'] = icons('unburrow', func['Unart'])
    upgrade = dict(id='Rubu', name=rstrings['Name'], gold=int(research['goldbase']), wood=int(research['lumberbase']), time=float(research['timebase']), tier=2, requires=rfunc['Requires'].split(','), slot=slot(rfunc), hotkey=rstrings['Hotkey'], tooltip=rstrings['Ubertip'].strip('"'), sourceRow=research, sourceFunc=rfunc, sourceStrings=rstrings, **icons('burrow-research', rfunc['Art']))
    files['crypt-burrow.json'] = encode(dict(author='MiYu', sourceUnitsPerWorldUnit=100, ability=skill, research=upgrade, form=form, metadata={k: v for k,v in metadata.items() if 'Abur' in v.get('useSpecific', '').split(',')}))
    files['Assets/Licenses/Classic-Crypt-Burrow.txt'] = b'Original Warcraft III Burrow data and command textures: Blizzard Entertainment original game asset terms apply. MPQ paths and SHA-256 are retained in crypt-burrow-sources.json. Extraction does not grant redistribution rights.\n'
    for path, raw in files.items():
        target = args.output / path
        if target.exists() and target.read_bytes() != raw: assert any(r['path'] == path and r['sha256'] == sha(target.read_bytes()) for r in previous.get('files', [])), 'Preserve edited output: ' + path
    for path, raw in files.items():
        target = args.output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    manifest = dict(author='MiYu', generator='scripts/import-frost-crypt-burrow.py', generatorSha256=sha(Path(__file__).read_bytes()), gameDirectory=retained.get('gameDirectory', str(args.game)), reaSource='https://github.com/morluto/rea', reaVersion='6.5.0', reaEvidence='tmp/docs-artifacts/frost-crypt-burrow/', sources=list(sources.values()), files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p,raw in files.items()], originalRuntimeVerified=False, license='Blizzard Entertainment original game terms')
    (args.output / receipt).write_bytes(encode(manifest))
    print('PASS source Burrow: research, morph body, original icons and ' + str(len(files)) + ' signed outputs')


if __name__ == '__main__': main()

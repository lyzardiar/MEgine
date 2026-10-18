"""Author: MiYu. Retain original Necromancer/Shaman spell rules, command cards and field metadata."""
import argparse
import hashlib
import importlib
import io
import json
from pathlib import Path
from PIL import Image
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-human-army').section


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--source-sample', type=Path, default=SAMPLE)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); name = 'caster-spells-sources.json'; prefix = 'SourceAssets/CasterSpells/'
    retained_file = args.source_sample / name; retained = json.loads(retained_file.read_bytes()) if retained_file.exists() else {}
    previous_file = args.output / name; previous = json.loads(previous_file.read_bytes()) if previous_file.exists() else {}
    files, sources, archives = {}, {}, []
    for r in previous.get('files', []):
        raw = (args.output / r['path']).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Preserve edited output: ' + r['path']

    def original(path):
        if path in sources: return files[prefix + path]
        record = next((r for r in retained.get('sources', []) if r['path'] == path), None)
        if record:
            raw = (args.source_sample / prefix / path).read_bytes(); assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Corrupt retained source: ' + path
        else:
            assert not retained, 'Missing retained source: ' + path
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'])
            for archive_name, archive in archives:
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise FileNotFoundError(path)
            record = dict(path=path, archive=archive_name, bytes=len(raw), sha256=sha(raw))
        files[prefix + path] = raw; sources[path] = record
        return raw

    def icon(key, art, disabled=False):
        path = art.replace('\\', '/')
        if disabled: path = path.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
        stream = io.BytesIO(); Image.open(io.BytesIO(original(path))).convert('RGBA').save(stream, format='PNG')
        output = 'Assets/Art/classic-caster-' + key + ('-disabled' if disabled else '') + '.png'; files[output] = stream.getvalue(); return output

    tables = {key: rows(original('Units/' + key + '.slk')) for key in ['AbilityData', 'AbilityMetaData', 'UnitWeapons']}
    labels = dict(line.split('=', 1) for line in original('UI/WorldEditStrings.txt').decode('utf-8').splitlines() if '=' in line and not line.startswith('//'))
    spells = {}
    for key, ability, unit, race, rank in [('raise', 'Arai', 'unec', 'Undead', 0), ('frenzy', 'Auhf', 'unec', 'Undead', 1), ('cripple', 'Acri', 'unec', 'Undead', 2), ('purge', 'Apg2', 'oshm', 'Orc', 0), ('lightningShield', 'Alsh', 'oshm', 'Orc', 1), ('bloodlust', 'Ablo', 'oshm', 'Orc', 2)]:
        row = tables['AbilityData'][ability]; weapon = tables['UnitWeapons'][unit]
        func, text = [section(original('Units/' + race + 'Ability' + suffix + '.txt'), ability) for suffix in ['Func', 'Strings']]
        metadata = {k: r for k, r in tables['AbilityMetaData'].items() if ability in r.get('useSpecific', '').split(',') or row['code'] in r.get('useSpecific', '').split(',')}
        d = dict(sourceAbility=ability, caster='necromancer' if unit == 'unec' else 'shaman', rank=rank, name=text['Name'], hotkey=text['Hotkey'], tooltip=text['Ubertip'].strip('"'), slot=sum(int(v) * n for v, n in zip(func['Buttonpos'].split(','), [1, 4])), cost=float(row['Cost1']), cooldown=float(row['Cool1']), duration=float(row['Dur1']), heroDuration=float(row['HeroDur1']), range=float(row['Rng1']) / 100, targets=row['targs1'].split(','), castPoint=float(weapon['castpt']), castBackswing=float(weapon['castbsw']), sourceRow=row, sourceWeaponRow=weapon, sourceFunc=func, sourceStrings=text, sourceMetadata=metadata, sourceFieldLabels={r['displayName']: labels[r['displayName']] for r in metadata.values() if r.get('displayName') in labels}, icon=icon(key, func['Art']), disabledIcon=icon(key, func['Art'], True))
        if func.get('Unart'): d['offIcon'] = icon(key + '-off', func['Unart'])
        spells[key] = d
    spells['purge'].update(movementFactor=int(spells['purge']['sourceRow']['DataA1']), summonedDamage=float(spells['purge']['sourceRow']['DataC1']), pause=float(spells['purge']['sourceRow']['DataD1']), heroPause=float(spells['purge']['sourceRow']['DataE1']))
    spells['lightningShield'].update(radius=float(spells['lightningShield']['sourceRow']['Area1']) / 100, power=float(spells['lightningShield']['sourceRow']['DataA1']))
    files['caster-spells.json'] = encode(dict(author='MiYu', sourceUnitsPerWorldUnit=100, spells=spells))
    files['Assets/Licenses/Classic-Caster-Spells.txt'] = b'Original Warcraft III spell data and command icons: Blizzard Entertainment original game terms. REA upstream https://github.com/morluto/rea; fixed version and maintenance in third_party/rea/README-MENGINE.md. Archive and file identities: caster-spells-sources.json.\n'
    owned = {r['path'] for r in previous.get('files', [])}
    for path, raw in files.items(): assert not (args.output / path).exists() or (args.output / path).read_bytes() == raw or path in owned, 'Preserve unsigned output: ' + path
    generators = ['scripts/import-frost-caster-spells.py', 'scripts/import-frost-wisp-rules.py', 'scripts/import-frost-human-army.py', 'scripts/warcraft_mpq.py']
    receipt = dict(author='MiYu', reaUpstream='https://github.com/morluto/rea', reaVersion='6.5.0', archivePrecedence=['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'], sources=sorted(sources.values(), key=lambda r: r['path']), generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes())) for p in generators], files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    for path, raw in files.items():
        target = args.output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    (args.output / name).write_bytes(encode(receipt)); print('PASS six original caster spells, source cast points/backswing, command cards and field metadata')


if __name__ == '__main__': main()

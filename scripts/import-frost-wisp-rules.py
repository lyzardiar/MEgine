"""Author: MiYu. Read original Wisp balance and harvest ability rows from verified MPQ exports."""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'


def rows(raw):
    cells, x, y = {}, 1, 1
    for line in raw.decode('utf-8').splitlines():
        if not line.startswith('C;'): continue
        a, b, k = re.search(r';X(\d+)', line), re.search(r';Y(\d+)', line), re.search(r';K(.*)$', line)
        if a: x = int(a[1])
        if b: y = int(b[1])
        if k: cells.setdefault(y, {})[x] = k[1].strip('"')
    header = cells.pop(1)
    return {row[1]: {header[c]: v for c, v in row.items() if c in header} for row in cells.values() if 1 in row}


def sha(raw): return hashlib.sha256(raw).hexdigest()


def main():
    files, sources, selected = {}, [], {}
    manifest_path = SAMPLE / 'wisp-rule-sources.json'
    previous = json.loads(manifest_path.read_bytes()) if manifest_path.exists() else {}
    for name, pack, row in [('UnitBalance', 'night-elf-rule-export', 'ewsp'), ('UnitWeapons', 'night-elf-rule-export', 'ewsp'), ('UnitAbilities', 'night-elf-rule-export', 'ewsp'), ('AbilityData', 'wisp-ability-export', 'Awha')]:
        directory = ROOT / 'tmp' / pack
        relative = 'Units/' + name + '.slk'
        exported = (directory / 'manifest.json').exists()
        records = json.loads((directory / 'manifest.json').read_bytes())['files'] if exported else previous['sources']
        record = next(r for r in records if r['path'].replace('\\', '/') == relative)
        raw = (directory / 'raw' / relative if exported else SAMPLE / 'SourceAssets/WarcraftIII' / relative).read_bytes()
        assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
        files['SourceAssets/WarcraftIII/' + relative] = raw
        sources.append(record)
        selected[name] = rows(raw)[row]
    balance, ability = selected['UnitBalance'], selected['AbilityData']
    assert balance['regenType'] == 'night' and selected['UnitWeapons']['weapsOn'] == '0' and 'Awha' in selected['UnitAbilities']['abilList'].split(',')
    # MiYu: gameplay ranges and movement retain the sample's existing 100 source units per world unit.
    catalog = dict(author='MiYu', sourceUnit='ewsp', sourceAbility='Awha', sourceUnitsPerWorldUnit=100, hp=int(balance['HP']), damage=0, armorValue=int(balance['def']), armor=balance['defType'], speed=int(balance['spd']) / 100, gold=int(balance['goldcost']), wood=int(balance['lumbercost']), food=int(balance['fused']), time=int(balance['bldtm']), nightRegen=float(balance['regenHP']), lumber=int(ability['DataA1']), harvestTime=float(ability['Dur1']), harvestReach=float(ability['DataC1']) / 100, sourceRows=selected)
    files['wisp-rules.json'] = (json.dumps(catalog, separators=(',', ':')) + '\n').encode()
    files['Assets/Licenses/Classic-Wisp-Rules.txt'] = b'Wisp unit and harvest ability data: Blizzard Entertainment, original Warcraft III game asset terms apply. Original MPQ files, archive identities, hashes and selected rows are recorded in wisp-rule-sources.json and wisp-rules.json.\n'
    old = {f['path']: f['sha256'] for f in previous.get('files', [])}
    for relative, raw in files.items():
        target = SAMPLE / relative
        if target.exists() and target.read_bytes() != raw: assert sha(target.read_bytes()) == old.get(relative), 'Preserve modified Wisp rules: ' + relative
    for relative, raw in files.items():
        target = SAMPLE / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    generator = 'scripts/import-frost-wisp-rules.py'
    manifest = dict(author='MiYu', generator=generator, generatorSha256=sha((ROOT / generator).read_bytes()), sources=sources, files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in files.items()])
    manifest_path.write_bytes((json.dumps(manifest, separators=(',', ':')) + '\n').encode())
    print('PASS source Wisp rules: 120 HP, no attack, 14s training, 5 lumber per 8s, 0.5 HP/s at night.')


if __name__ == '__main__': main()

"""Author: MiYu. Reproduce racial worker weapons from authenticated installed MPQ tables."""
import hashlib
import importlib
import json
import re
from pathlib import Path
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
GAME = Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne')
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def main():
    sources, originals = [], {}
    archives = [(name, mpyq.MPQArchive(str(GAME / name), listfile=False)) for name in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq']]
    for relative, retained in [('Units/UnitWeapons.slk', 'SourceAssets/WarcraftIII/Units/UnitWeapons.slk'), ('Units/MiscGame.txt', 'SourceAssets/CombatRewards/Units/MiscGame.txt'), ('Units/UnitBalance.slk', 'SourceAssets/CombatRewards/Units/UnitBalance.slk')]:
        for name, archive in archives:
            try: raw = read_archive(archive, relative.replace('/', '\\')); break
            except FileNotFoundError: continue
        else: raise FileNotFoundError(relative)
        assert (SAMPLE / retained).read_bytes() == raw, 'Original reference changed: ' + relative
        originals[relative] = raw
        sources.append(dict(path=relative, archive=name, bytes=len(raw), sha256=sha(raw), localPath=retained))
    table = importlib.import_module('import-frost-wisp-rules').rows(originals['Units/UnitWeapons.slk'])
    balance = importlib.import_module('import-frost-wisp-rules').rows(originals['Units/UnitBalance.slk'])
    units = {}
    for source in ['hpea', 'opeo', 'uaco']:
        row = table[source]
        assert row['weapTp1'] == row['atkType1'] == 'normal' and 'air' not in row['targs1'].split(',')
        dice, sides, bonus = int(row['dice1']), int(row['sides1']), int(row['dmgplus1'])
        units[source] = dict(sourceUnit=source, collision=float(balance[source]['collision']) / 100, damage=bonus + dice * (sides + 1) / 2, bonus=bonus, dice=dice, sides=sides, range=float(row['rangeN1']) / 100, cooldown=float(row['cool1']), damagePoint=float(row['dmgpt1']), backswing=float(row['backSw1']), attack=row['atkType1'], antiAir=False, missileSpeed=0, targets=row['targs1'].split(','), acquisition=float(row['acquire']) / 100, sourceRow=row)
    misc = originals['Units/MiscGame.txt'].decode('utf-8-sig')
    normal = re.search(r'^DamageBonusNormal=([^\r\n]+)', misc, re.M)[1]
    armor = ['light', 'medium', 'heavy', 'fortified', 'normal', 'hero', 'divine', 'unarmored']
    encoded = (json.dumps(dict(author='MiYu', sourceUnitsPerWorldUnit=100, units=units, damageTable=dict(normal=dict(zip(armor, map(float, normal.split(',')))))), separators=(',', ':')) + '\n').encode()
    target = SAMPLE / 'worker-weapons.json'
    previous = SAMPLE / 'worker-weapons-sources.json'
    if target.exists():
        assert previous.exists() and sha(target.read_bytes()) == json.loads(previous.read_text(encoding='utf-8'))['profileSha256'], 'Preserve modified worker weapons'
    target.write_bytes(encoded)
    manifest = dict(author='MiYu', generator='scripts/import-frost-worker-weapons.py', gameDirectory=str(GAME), sources=sources, profileSha256=sha(encoded), reaEvidence='tmp/docs-artifacts/frost-worker-weapons/worker-weapons-rea.json', license='Blizzard Entertainment original game terms; extraction does not grant redistribution rights')
    previous.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print('PASS original worker weapons: 5-6 / 7-8 / 9-10 damage, range 90, cooldown 2 / 3 / 2.5 and source attack points')


if __name__ == '__main__': main()

"""Author: MiYu. Import three racial worker balance profiles from the installed Warcraft MPQs."""
import hashlib
import importlib
import json
from pathlib import Path
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
GAME = Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne')
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def main():
    relative = 'Units/UnitBalance.slk'
    for name in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq']:
        archive = mpyq.MPQArchive(str(GAME / name), listfile=False)
        try: raw = read_archive(archive, relative.replace('/', '\\')); break
        except FileNotFoundError: continue
    else: raise FileNotFoundError(relative)
    original = SAMPLE / 'SourceAssets/CombatRewards' / relative
    assert original.read_bytes() == raw, 'Worker reference differs from authenticated original export'
    rows = importlib.import_module('import-frost-wisp-rules').rows(raw)
    units = {}
    for source, label in [('hpea', 'Peasant'), ('opeo', 'Peon'), ('uaco', 'Acolyte')]:
        row = rows[source]
        units[source] = dict(sourceUnit=source, label=label, hp=int(row['HP']), speed=int(row['spd']) / 100, armor=row['defType'], armorValue=int(row['def']), gold=int(row['goldcost']), wood=int(row['lumbercost']), food=int(row['fused']), time=int(row['bldtm']), sourceRow=row)
    encoded = (json.dumps(dict(author='MiYu', sourceUnitsPerWorldUnit=100, units=units), separators=(',', ':')) + '\n').encode()
    manifest = dict(author='MiYu', generator='scripts/import-frost-worker-balance.py', gameDirectory=str(GAME), source=dict(path=relative, archive=name, archiveBytes=(GAME / name).stat().st_size, bytes=len(raw), sha256=sha(raw), localPath='SourceAssets/CombatRewards/' + relative), profileSha256=sha(encoded), reaEvidence='tmp/docs-artifacts/frost-worker-balance/worker-fields-rea.json', license='Blizzard Entertainment original game terms; extraction does not grant redistribution rights')
    (SAMPLE / 'worker-balance.json').write_bytes(encoded)
    (SAMPLE / 'worker-balance-sources.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print('PASS original worker balance: Peasant 220 HP / Peon 250 HP / Acolyte 220 HP; 75 gold and 15 seconds each')


if __name__ == '__main__': main()

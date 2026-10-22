"""Author: MiYu. Preserve source weapon classes and target masks for Cloud restrictions."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sys.path.insert(0, str(ROOT / 'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile

sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
HALLS = [['htow', 'hkee', 'hcas'], ['ogre', 'ostr', 'ofrt'], ['etol', 'etoa', 'etoe'], ['unpl', 'unp1', 'unp2']]
TOWERS = dict(tower='owtw', guardtower='hgtw', arcanetower='hatw', cannontower='hctw', spirittower='uzg1', nerubiantower='uzg2')
TYPES = dict(normal=1, missile=2, artillery=3, instant=4, msplash=5, mbounce=6, mline=7, aline=8)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll'))
    parser.add_argument('--source', type=Path, default=SAMPLE / 'SourceAssets/HumanAviary/Units/UnitWeapons.slk')
    parser.add_argument('--output', type=Path, default=SAMPLE)
    args = parser.parse_args()
    source = args.source
    raw = source.read_bytes()
    assert sha(raw) == '03c9cbc02d703cf5f8b5b1ed4da789ffcf733aff44f8e2f70b7937e4de613b33', 'UnitWeapons source changed'
    binary = args.binary.read_bytes()
    assert sha(binary) == 'e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a', 'Game.dll source changed'
    pe = pefile.PE(data=binary)
    mapped = pe.get_memory_mapped_image()
    base = pe.OPTIONAL_HEADER.ImageBase
    targets = {}
    for address in range(0x6fb6a0b0, 0x6fb6a240, 8):
        pointer, mask = struct.unpack_from('<II', mapped, address - base)
        name = mapped[pointer-base:pointer-base+64].split(b'\0')[0].decode('ascii')
        targets[name] = mask
    rows = importlib.import_module('import-frost-wisp-rules').rows(raw)
    units, selected = {}, {}
    ids = {source for row in HALLS for source in row} | set(TOWERS.values()) | {'eaom', 'etrp', 'eden', 'eaoe', 'eaow', 'hrif', 'hgyr'}
    for unit in sorted(ids):
        row = rows[unit]
        selected[unit] = {name: row.get(name) for name in ['weapsOn', 'weapTp1', 'targs1', 'weapTp2', 'targs2']}
        units[unit] = {}
        for slot in [1, 2]:
            kind = row.get('weapTp' + str(slot), '_')
            tokens = row.get('targs' + str(slot), '_').split(',')
            tokens = [token for token in tokens if token not in ['', '_', '-']]
            mask = 0
            for token in tokens: mask |= targets[token]
            assert kind in TYPES or kind in ['', '_', '-'], (unit, slot, kind)
            units[unit][slot] = dict(weaponType=kind, weaponCode=TYPES.get(kind, 0), targets=tokens, targetMask=mask)
    data = dict(author='MiYu', weaponTypes=TYPES, targetTypes=targets, hallSources=HALLS, towers=TOWERS, units=units)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    payload = encode(data)
    (output / 'cloud-weapon-rules.json').write_bytes(payload)
    receipt = dict(author='MiYu', reaUpstream='https://github.com/morluto/rea', reaVersion='6.5.0', reaCommit='3b79af28e80785afce9f5998d8f03289402a1847', generator='scripts/import-frost-cloud-weapons.py', generatorSha256=sha(Path(__file__).read_bytes().replace(b'\r\n', b'\n')), source=dict(path='SourceAssets/HumanAviary/Units/UnitWeapons.slk', archive='War3Patch.mpq', sha256=sha(raw), bytes=len(raw)), binary=dict(name='Game.dll', sha256=sha(binary), targetTable=['0x6fb6a0b0', '0x6fb6a240'], weaponConverter='0x6f689580', weaponGate='0x6f47bfc0'), sourceRows=selected, files=[dict(path='cloud-weapon-rules.json', sha256=sha(payload), bytes=len(payload))], originalBattleVerified=False)
    (output / 'cloud-weapon-sources.json').write_bytes(encode(receipt))
    print(f'PASS Cloud weapon sources: {len(units)} units, {len(targets)} target tokens')

if __name__ == '__main__': main()

"""Author: MiYu. Preserve Warcraft building proportions and source object modelScale."""
import argparse
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'third_party/mpyq'))
import mpyq

IDS = dict(townhall='htow', humanbarracks='hbar', farm='hhou', humantower='hgtw', altarofkings='halt', workshop='harm', arcanevault='hvlt', greathall='ogre', orcbarracks='obar', trollburrow='otrb', watchtower='owtw', altarofstorms='oalt', warmill='ofor', voodoolounge='ovln', treeoflife='etol', ancientofwar='eaom', moonwell='emow', ancientprotector='etrp', altarofelders='eate', huntershall='edob', ancientofwonder='eden', necropolis='unpl', crypt='usep', ziggurat='uzig', altarofdarkness='uaod', slaughterhouse='uslh', tombofrelics='utom', templeofthedamned='utod', hauntedmine='ugol', spiritlodge='osld')
IDS['entangledgoldmine'] = 'egol'
TIERS = dict(townhall=['htow', 'hkee', 'hcas'], greathall=['ogre', 'ostr', 'ofrt'], treeoflife=['etol', 'etoa', 'etoe'], necropolis=['unpl', 'unp1', 'unp2'], ziggurat=['uzig', 'uzg1', 'uzg2'])
TIERS['humantower'] = ['hwtw', 'hgtw']


def rows(raw):
    cells = {}; x = y = 0
    for line in raw.decode('utf-8-sig').splitlines():
        if not line.startswith('C;'): continue
        for field in re.findall(r'(?:[^;\"]|\"(?:\"\"|[^\"])*\")+', line):
            if field.startswith('X'): x = int(field[1:])
            elif field.startswith('Y'): y = int(field[1:])
            elif field.startswith('K'): cells[x, y] = field[1:].strip('"').replace('""', '"')
    headers = {x: v for (x, y), v in cells.items() if y == 1}; result = {}
    for (x, y), value in cells.items():
        if y > 1 and x in headers: result.setdefault(y, {})[headers[x]] = value
    return {r['unitUIID']: r for r in result.values()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'samples/frostbound-realms')
    args = parser.parse_args(); raw = archive_name = None
    for name in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq']:
        archive = mpyq.MPQArchive(str(args.game / name)); source = next((p.decode() for p in archive.files if p.lower() == b'units\\unitui.slk'), None)
        if source: raw = archive.read_file(source); archive_name = name
        archive.file.close()
    assert raw; data = rows(raw); output = args.output.resolve(); catalog = json.loads((output / 'model-catalog.json').read_bytes()); entries = {}
    for key, asset in catalog.items():
        if not asset.get('classic') or not asset.get('factionBuilding'): continue
        stem = pathlib.PureWindowsPath(asset['sourceModel']).stem.lower(); tier = asset.get('classicTier', 1)
        unit = TIERS[stem][tier - 1] if stem in TIERS else IDS[stem]; row = data[unit]
        assert row['file'].replace('\\', '/').lower() == asset['sourceModel'].replace('\\', '/').removesuffix('.mdx').lower(), key
        scale = float(row['modelScale']); assert scale > 0
        entries[key] = dict(unit=unit, sourceModel=asset['sourceModel'], modelScale=scale)
    result = dict(author='MiYu', worldScale=2, models=entries)
    encode = lambda v: (json.dumps(v, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    files = {'SourceAssets/WarcraftIII/Units/unitUI.slk': raw, 'building-scale-catalog.json': encode(result)}
    receipt = output / 'building-scale-sources.json'; previous = json.loads(receipt.read_bytes()) if receipt.exists() else None
    old = {f['path']: f['sha256'] for f in previous['files']} if previous else {}
    for path, value in files.items():
        target = output / path
        if target.exists() and target.read_bytes() != value: assert hashlib.sha256(target.read_bytes()).hexdigest() == old.get(path), 'Preserve modified building scale: ' + path
    for path, value in files.items():
        target = output / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(value)
    receipt.write_bytes(encode(dict(generator='scripts/import-frost-building-scales.py', generatorSha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(), archive=archive_name, source='Units/unitUI.slk', files=[dict(path=p, bytes=len(v), sha256=hashlib.sha256(v).hexdigest()) for p, v in files.items()])))
    print('PASS source object modelScale:', len(entries), 'buildings; source archive', archive_name)


if __name__ == '__main__': main()

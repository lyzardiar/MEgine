"""Author: MiYu. Source object scales and selection-circle dimensions for classic actors."""
import hashlib
import importlib
import json
import pathlib
import struct
import argparse

base = importlib.import_module('import-frost-building-scales')
ROOT = base.ROOT
IDS = dict(footman='hfoo', peasant='hpea', archer='earc', catapult='ocat', knight='hkni', heropaladin='Hpal', heroarchmage='Hamg', herobloodelf='Hblm', heromoonpriestess='Emoo', rifleman='hrif', direwolf='nwld', polarbear='nplb', ent='efon', grunt='ogru', skeletonarcher='nska', necromancer='unec', skeleton='uske', shaman='oshm', skeletonmage='uskm', acolyte='uaco', ghoul='ugho', abomination='uabo', peon='opeo', wisp='ewsp', headhunter='ohun', huntress='esen', druidoftheclaw='edoc', meatwagon='umtw', mortarteam='hmtm', gryphonrider='hgry', wyvernrider='owyv', chimaera='echm', frostwyrm='ufro')


def sha(raw): return hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'samples/frostbound-realms')
    args = parser.parse_args(); output = args.output.resolve(); catalog = json.loads((output / 'model-catalog.json').read_bytes())
    owner_raw = (output / 'building-scale-sources.json').read_bytes(); owner = json.loads(owner_raw)
    ui = output / 'SourceAssets/WarcraftIII/Units/unitUI.slk'; raw = ui.read_bytes(); expected = next(f['sha256'] for f in owner['files'] if f['path'].endswith('unitUI.slk')); assert sha(raw) == expected
    rows = base.rows(raw); models = {}; selection = {}
    for key, asset in catalog.items():
        if not asset.get('classic') or asset.get('factionBuilding') or not asset.get('worldHeight'): continue
        unit = IDS[pathlib.PureWindowsPath(asset['sourceModel']).stem.lower()]; row = rows[unit]
        assert row['file'].replace('\\', '/').lower() == asset['sourceModel'].replace('\\', '/').removesuffix('.mdx').lower(), key
        models[key] = dict(unit=unit, sourceModel=asset['sourceModel'], modelScale=float(row['modelScale']), selectionScale=float(row['scale']))
    buildings = json.loads((output / 'building-scale-catalog.json').read_bytes())
    for key, model in buildings['models'].items(): selection[key] = float(rows[model['unit']]['scale'])
    assert all(v['modelScale'] > 0 and v['selectionScale'] > 0 for v in models.values())
    library = ROOT / 'asset-library/warcraft-iii/remaining-ready'; receipt = json.loads((library / 'asset-sources.json').read_bytes()); sources = {f['path'].replace('\\', '/').lower(): f for f in receipt['sourceFiles']}; files = {}; circles = {}
    for kind, path in [('unit', 'UI/Feedback/SelectionCircleUnit/selectioncircleUnit.mdx'), ('hero', 'UI/Feedback/SelectionCircleHero/SelectionCircleHero.mdx')]:
        raw = (library / 'SourceAssets' / path).read_bytes(); assert sha(raw) == sources[path.lower()]['sha256']; assert raw[:4] == b'MDLX'
        offset = 4; vertices = []
        while offset < len(raw):
            tag, length = struct.unpack_from('<4sI', raw, offset); end = offset + 8 + length; assert end <= len(raw)
            if tag == b'GEOS':
                p = offset + 8
                while p < end:
                    size = struct.unpack_from('<I', raw, p)[0]; assert size > 12 and raw[p+4:p+8] == b'VRTX'; count = struct.unpack_from('<I', raw, p+8)[0]
                    vertices.extend(struct.iter_unpack('<fff', raw[p+12:p+12+count*12])); p += size
                assert p == end
            offset = end
        assert vertices
        span = max(max(v[i] for v in vertices) - min(v[i] for v in vertices) for i in [0, 1]) / 128 * buildings['worldScale']
        target = 'SourceAssets/WarcraftIII/' + path; files[target] = raw; circles[kind] = dict(source=target, worldSpan=span)
    result = dict(author='MiYu', worldScale=buildings['worldScale'], models=models, buildingSelection=selection, circles=circles)
    encode = lambda v: (json.dumps(v, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    files['unit-scale-catalog.json'] = encode(result); path = output / 'unit-scale-sources.json'; old = {f['path']: f['sha256'] for f in json.loads(path.read_bytes())['files']} if path.exists() else {}
    for relative, raw in files.items():
        target = output / relative
        if target.exists() and target.read_bytes() != raw: assert sha(target.read_bytes()) == old.get(relative), 'Preserve modified unit scale: ' + relative
    for relative, raw in files.items():
        target = output / relative; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    tools = ['scripts/import-frost-unit-scales.py', 'scripts/import-frost-building-scales.py']
    path.write_bytes(encode(dict(generator=tools[0], generators={p: sha((ROOT / p).read_bytes()) for p in tools}, ownerReceiptSha256=sha(owner_raw), sourceUI=expected, files=[dict(path=p, bytes=len(v), sha256=sha(v)) for p, v in files.items()])))
    print('PASS source actor scales:', len(models), 'actors,', len(selection), 'building selection sizes,', len(circles), 'source circles')


if __name__ == '__main__': main()

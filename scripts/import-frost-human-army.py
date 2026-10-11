"""Author: MiYu. Reproduce human Barracks training rules, icons and prerequisite building models."""
import argparse
import hashlib
import importlib
import io
import json
import pathlib
import re
import sys
import tempfile
import uuid
from PIL import Image
from warcraft_mpq import mpyq, read_archive

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
rows = importlib.import_module('import-frost-wisp-rules').rows
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def section(raw, key):
    text = re.search(r'^\[' + key + r'\]\s*\n(.*?)(?=^\[|\Z)', raw.decode('utf-8'), re.M | re.S)[1]
    return dict(line.split('=', 1) for line in text.splitlines() if '=' in line and not line.startswith('//'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--library', type=pathlib.Path, default=ROOT / 'asset-library/warcraft-iii')
    parser.add_argument('--pose-probe', type=pathlib.Path, required=True)
    parser.add_argument('--metadata-reader', type=pathlib.Path, required=True)
    args = parser.parse_args(); output = args.output.resolve()
    previous_path = SAMPLE / 'human-army-sources.json'
    previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else {}
    files, sources, archives = {}, [], []

    def original(path):
        record = next((r for r in previous.get('sources', []) if r['path'] == path), None)
        if record:
            raw = (SAMPLE / 'SourceAssets/HumanArmy' / path).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], path
        else:
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing human army source: ' + path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        files['SourceAssets/HumanArmy/' + path] = raw; sources.append(record)
        return raw

    tables = {name: rows(original('Units/' + name + '.slk')) for name in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'UnitUI']}
    func, strings = original('Units/HumanUnitFunc.txt'), original('Units/HumanUnitStrings.txt')
    armor = {'large': 'heavy', 'medium': 'medium', 'fort': 'fortified'}
    units, buildings = {}, {}
    bindings = [('humanfootman', 'hfoo', 'Footman', 'RealFootman'), ('humanrifleman', 'hrif', 'Rifleman', 'RealRifleman'), ('humanknight', 'hkni', 'Knight', 'RealKnight'), ('barracks', 'hbar', 'Barracks', 'KingdomBarracks'), ('blacksmith', 'hbla', 'Blacksmith', 'KingdomBlacksmith'), ('lumbermill', 'hlum', 'Lumber Mill', 'KingdomLumberMill')]
    for kind, source, label, model in bindings:
        b, w, ui = [tables[key][source] for key in ['UnitBalance', 'UnitWeapons', 'UnitUI']]
        command, text = section(func, source), section(strings, source)
        mobile = kind.startswith('human')
        d = dict(sourceUnit=source, label=label, model=model, hp=int(b['HP']), armor=armor[b['defType']], armorValue=float(b['def']), gold=int(b['goldcost']), wood=int(b['lumbercost']), food=int(b['fused']) if mobile else 0, time=float(b['bldtm']), speed=float(b['spd']) / 100 if mobile else 0, damage=float(w['avgdmg1']) if mobile else 0, range=float(w['rangeN1']) / 100 if mobile else 0, collision=float(b['collision']) / 100, attack=w['atkType1'], antiAir=mobile and 'air' in w['targs1'].split(','), organic=mobile, healthRegen=float(b['regenHP']) if mobile else 0, requires=command.get('Requires', '').split(',') if command.get('Requires') else [], slot=sum(int(v) * factor for v, factor in zip(command['Buttonpos'].split(','), [1, 4])), hotkey=text['Hotkey'], icon='Assets/Art/classic-' + kind + '.png', disabledIcon='Assets/Art/classic-' + kind + '-disabled.png', sourceRows={key: tables[key][source] for key in tables}, sourceFunc=command, sourceStrings=text, modelScale=float(ui['modelScale']), selectionScale=float(ui['scale']))
        if mobile: d.update(cooldown=float(w['cool1']), damagePoint=float(w['dmgpt1']), missileSpeed=0, weaponType=w['weapTp1'], dice=int(w['dice1']), sides=int(w['sides1']), bonus=float(w['dmgplus1']), sight=float(b['sight']) / 100, nightSight=float(b['nsight']) / 100)
        else: d.update(radius=float(b['collision']) / 100)
        (units if mobile else buildings)[kind] = d
        for disabled in [False, True]:
            path = command['Art'].replace('\\', '/')
            if disabled: path = path.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
            png = io.BytesIO(); Image.open(io.BytesIO(original(path))).convert('RGBA').save(png, format='PNG')
            files[d['disabledIcon' if disabled else 'icon']] = png.getvalue()
    source_kinds = {u['sourceUnit']: k for k, u in units.items()}
    roster = [source_kinds[k] for k in buildings['barracks']['sourceFunc']['Trains'].split(',')]
    misc = section(original('Units/MiscGame.txt'), 'Misc')
    armor_keys = ['light', 'medium', 'heavy', 'fortified', 'normal', 'hero', 'divine', 'unarmored']
    catalog = dict(author='MiYu', sourceUnitsPerWorldUnit=100, units=units, buildings=buildings, roster=roster, damageTable={kind: dict(zip(armor_keys, map(float, misc['DamageBonus' + kind.capitalize()].split(',')))) for kind in ['normal', 'pierce']})
    files['human-army.json'] = encode(catalog)
    model_bindings = [dict(key='KingdomBlacksmith', source='Blacksmith', pack='game-ready', model='buildings/Human/Blacksmith/Blacksmith.mdx', building=True), dict(key='KingdomLumberMill', source='HumanLumberMill', pack='game-ready', model='buildings/Human/HumanLumberMill/HumanLumberMill.mdx', building=True)]
    output.parent.mkdir(parents=True, exist_ok=True); (ROOT / 'tmp').mkdir(exist_ok=True)
    # MiYu: reuse the signed conversion and native bounds path with an explicit library root.
    with tempfile.TemporaryDirectory(prefix='human-army-', dir=output.parent) as directory:
        work = pathlib.Path(directory); overlay = work / 'overlay'; geometry = work / 'geometry'; geometry.mkdir()
        (geometry / 'model-catalog.json').write_bytes(encode({})); (geometry / 'classic-sources.json').write_bytes(encode(dict(files=[])))
        binding_path = work / 'bindings.json'; binding_path.write_bytes(encode(dict(models=model_bindings)))
        nodes = importlib.import_module('convert-frost-classic-billboards'); nodes.LIBRARY = args.library.resolve()
        classic = importlib.import_module('import-frost-classic'); classic.LIBRARY = nodes.LIBRARY
        sys.argv = ['convert-frost-classic-billboards.py', '--bindings', str(binding_path), '--output', str(overlay), '--metadata-reader', str(args.metadata_reader)]
        nodes.main()
        sys.argv = ['import-frost-classic.py', '--output', str(geometry), '--pose-probe', str(args.pose_probe), '--billboard-library', str(overlay), '--bindings', str(binding_path), '--keys', 'KingdomBlacksmith', 'KingdomLumberMill']
        classic.main()
        remap = lambda path: path.replace('Assets/WarcraftIII/', 'Assets/HumanArmy/')
        model_catalog = json.loads((geometry / 'model-catalog.json').read_bytes())
        files['human-army-models.json'] = encode(json.loads(remap(json.dumps(model_catalog, ensure_ascii=False))))
        geometry_receipt = json.loads((geometry / 'classic-sources.json').read_bytes())
        for record in geometry_receipt['files']:
            path = remap(record['path']); raw = (geometry / record['path']).read_bytes()
            assert sha(raw) == record['sha256']
            if path.endswith('.meta'):
                meta = json.loads(raw); meta['guid'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + path[:-5])); raw = encode(meta)
            elif path.endswith(('.mmat', '.json')): raw = remap(raw.decode('utf-8')).encode('utf-8')
            files[path] = raw
        geometry_sources = geometry_receipt['models']
        library_receipt = sha((args.library / 'game-ready/asset-sources.json').read_bytes())
    files['Assets/Licenses/Classic-Human-Army.txt'] = b'Warcraft III human Barracks rules, icons, Blacksmith and Lumber Mill: Blizzard Entertainment. Original game asset terms apply; not CC0 or MIT. Source paths, archive identities, selected rows, conversion records and SHA-256 hashes: human-army-sources.json and human-army.json.\n'
    old = {r['path']: r['sha256'] for r in previous.get('files', [])}
    for path, raw in files.items():
        target = output / path
        if target.exists() and target.read_bytes() != raw: assert sha(target.read_bytes()) == old.get(path), 'Preserve modified human army output: ' + path
    for path, raw in files.items():
        target = output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    generators = ['scripts/import-frost-human-army.py', 'scripts/import-frost-classic.py', 'scripts/convert-frost-classic-billboards.py', 'scripts/import-frost-wisp-rules.py']
    receipt = dict(author='MiYu', generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes())) for p in generators], sources=sources, models=geometry_sources, sourceCollection=dict(pack='game-ready', sha256=library_receipt), poseProbeSha256=sha(args.pose_probe.read_bytes()), metadataReaderSha256=sha(args.metadata_reader.read_bytes()), files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    (output / 'human-army-sources.json').write_bytes(encode(receipt))
    print('PASS original human Barracks: three source units, three building rules, prerequisite models and twelve icons')


if __name__ == '__main__': main()

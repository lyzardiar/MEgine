"""Author: MiYu. Independently verify Sanctum source tables, pixels, skin tracks and safe reproduction."""
import argparse
import csv
import hashlib
import io
import json
import math
import pathlib
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import uuid
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
digest = lambda raw: hashlib.sha256(raw).hexdigest()


def slk(raw):
    cells = {}; x = y = 1
    for line in raw.decode('utf-8').splitlines():
        if not line.startswith('C;'): continue
        for coordinate, value in re.findall(r';([XY])(\d+)', line):
            if coordinate == 'X': x = int(value)
            else: y = int(value)
        value = line.partition(';K')[2]
        if ';K' in line: cells[x, y] = value[1:-1] if value.startswith('"') and value.endswith('"') else value
    headers = {x: value for (x, y), value in cells.items() if y == 1}
    return {identifier: {headers[x]: value for (x, cy), value in cells.items() if cy == y and x in headers} for (column, y), identifier in cells.items() if column == 1 and y > 1}


def ini(raw):
    sections = {}; current = None
    for line in raw.decode('utf-8').splitlines():
        if line.startswith('[') and line.endswith(']'): current = sections.setdefault(line[1:-1], {})
        elif current is not None and '=' in line and not line.startswith('//'):
            key, value = line.split('=', 1); current[key] = value
    return sections


def glb(raw):
    magic, version, length = struct.unpack_from('<III', raw)
    assert (magic, version, length) == (0x46546c67, 2, len(raw))
    size, kind = struct.unpack_from('<II', raw, 12); assert kind == 0x4e4f534a
    binary_size, kind = struct.unpack_from('<II', raw, 20 + size)
    assert kind == 0x004e4942 and 28 + size + binary_size == len(raw)
    return json.loads(raw[20:20 + size])


def verify(sample, probe):
    receipt = json.loads((sample / 'human-sanctum-sources.json').read_bytes())
    rules = json.loads((sample / 'human-sanctum.json').read_bytes())
    models = json.loads((sample / 'human-sanctum-models.json').read_bytes())
    expected = {r['path']: r for r in receipt['files']}; identities = set(); materials = images = 0
    assert receipt['archivePrecedence'] == ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq']
    for record in receipt['generators']: assert digest((ROOT / record['path']).read_bytes()) == record['sha256'], record['path']
    for path, record in expected.items():
        raw = (sample / path).read_bytes(); assert len(raw) == record['bytes'] and digest(raw) == record['sha256'], path
        if path.endswith('.meta'):
            guid = uuid.UUID(json.loads(raw)['guid']); assert guid.int and guid not in identities, path
            assert str(guid) == str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + path[:-5])), path
            identities.add(guid)
        if path.endswith('.mmat'):
            materials += 1; assert path + '.meta' in expected, path
            for key, ref in json.loads(raw).items():
                if key.endswith('_texture') and isinstance(ref, str) and ref: assert ref in expected, ref
        if path.startswith('Assets/Art/'):
            images += 1; im = Image.open(io.BytesIO(raw)); assert im.size == (64, 64) and im.mode == 'RGBA', path
    source_root = sample / 'SourceAssets/HumanSanctum'
    for record in receipt['sources']:
        raw = (source_root / record['path']).read_bytes()
        assert len(raw) == record['bytes'] and digest(raw) == record['sha256'], record['path']
        assert record['archive'] in receipt['archivePrecedence']
    tables = {name: slk((source_root / ('Units/' + name + '.slk')).read_bytes()) for name in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'UnitUI', 'UpgradeData', 'AbilityData', 'AbilityMetaData']}
    funcs = {name: ini((source_root / ('Units/' + name + '.txt')).read_bytes()) for name in ['HumanUnitFunc', 'HumanUnitStrings', 'HumanUpgradeFunc', 'HumanUpgradeStrings', 'HumanAbilityFunc', 'HumanAbilityStrings', 'NightElfAbilityFunc', 'NightElfAbilityStrings']}
    assert rules['roster'] == ['humanpriest', 'humansorceress', 'humanspellbreaker']
    assert [rules['building'][k] for k in ['sourceUnit', 'hp', 'gold', 'wood', 'time', 'requires']] == ['hars', 1050, 150, 140, 70, ['hkee']]
    selected = [rules['building'], *rules['units'].values()]
    for unit in selected:
        key = unit['sourceUnit']; b, w, a, ui = [tables[name][key] for name in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'UnitUI']]
        assert unit['sourceRows'] == {name: tables[name][key] for name in ['UnitBalance', 'UnitWeapons', 'UnitUI', 'UnitAbilities']}
        assert unit['sourceFunc'] == funcs['HumanUnitFunc'][key] and unit['sourceStrings'] == funcs['HumanUnitStrings'][key]
        assert [unit[k] for k in ['hp', 'gold', 'wood', 'time', 'armorValue']] == [int(b['HP']), int(b['goldcost']), int(b['lumbercost']), float(b['bldtm']), float(b['def'])]
        assert unit['abilities'] == a['abilList'].split(',')
        m = models[unit['model']]; version = '_V1' if int(ui['fileVerFlags']) & 2 else ''
        assert m['sourceModel'].replace('\\', '/').lower() == (ui['file'] + version + '.mdx').replace('\\', '/').lower()
        assert m['sourceModelScale'] == float(ui['modelScale']) and m['sourceSelectionScale'] == float(ui['scale'])
        height = m['maxWorldHeight' if key == 'hars' else 'worldHeight']; assert math.isclose(height, m['size'][1] * 1.28 * float(ui['modelScale']), rel_tol=1e-12)
        if key != 'hars':
            assert [unit[k] for k in ['mana', 'initialMana', 'manaRegen', 'damage', 'range', 'cooldown', 'damagePoint']] == [int(b['manaN']), int(b['mana0']), float(b['regenMana']), float(w['avgdmg1']), float(w['rangeN1']) / 100, float(w['cool1']), float(w['dmgpt1'])]
        for disabled in [False, True]:
            art = unit['sourceFunc']['Art'].replace('\\', '/')
            if disabled: art = art.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
            expected_pixels = Image.open(io.BytesIO((source_root / art).read_bytes())).convert('RGBA').tobytes()
            assert Image.open(sample / unit['disabledIcon' if disabled else 'icon']).tobytes() == expected_pixels
    assert rules['units']['humanspellbreaker']['requires'] == ['hvlt', 'hkee']
    assert rules['units']['humanspellbreaker']['modelScale'] == .8
    assert list(rules['research']) == funcs['HumanUnitFunc']['hars']['Researches'].split(',')
    for key, research in rules['research'].items():
        row = tables['UpgradeData'][key]; func = funcs['HumanUpgradeFunc'][key]; text = funcs['HumanUpgradeStrings'][key]
        assert research['sourceRow'] == row and research['sourceFunc'] == func and research['sourceStrings'] == text
        assert len(research['levels']) == int(row['maxlevel'])
        for i, level in enumerate(research['levels']):
            assert [level['gold'], level['wood'], level['time']] == [int(row['goldbase']) + i * int(row['goldmod']), int(row['lumberbase']) + i * int(row['lumbermod']), float(row['timebase']) + i * float(row['timemod'])]
            assert level['requires'] == [k for k in func.get('Requires' + (str(i) if i else ''), '').split(',') if k]
            assert level['name'] == next(csv.reader([text['Name']]))[i]
            assert level['icon'] in expected and level['disabledIcon'] in expected
            for disabled in [False, True]:
                art = next(csv.reader([func['Art']]))[i].replace('\\', '/')
                if disabled: art = art.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
                assert Image.open(sample / level['disabledIcon' if disabled else 'icon']).tobytes() == Image.open(io.BytesIO((source_root / art).read_bytes())).convert('RGBA').tobytes()
    for key in ['Rhpt', 'Rhst']:
        research = rules['research'][key]; assert [l['requires'] for l in research['levels']] == [[], ['hcas']]
        assert research['effects'] == [dict(effect='rmnx', base=100., increment=100.), dict(effect='rmnr', base=.325, increment=.325), dict(effect='rhpx', base=40., increment=40.), dict(effect='ratd', base=0., increment=0.)]
    assert rules['research']['Rhss']['levels'][0]['requires'] == ['hvlt', 'hcas']
    for key, ability in rules['abilities'].items():
        row = tables['AbilityData'][key]; race = 'NightElf' if key == 'Amim' else 'Human'
        assert ability['sourceRow'] == row and ability['sourceFunc'] == funcs[race + 'AbilityFunc'][key] and ability['sourceStrings'] == funcs[race + 'AbilityStrings'][key]
        assert ability['sourceMetadata'] == {k: v for k, v in tables['AbilityMetaData'].items() if key in v.get('useSpecific', '').split(',')}
        assert [ability[k] for k in ['manaCost', 'cooldown', 'duration', 'heroDuration']] == [float(row[k]) for k in ['Cost1', 'Cool1', 'Dur1', 'HeroDur1']]
        art = ability['sourceFunc']['Art'].replace('\\', '/')
        assert Image.open(sample / ability['icon']).tobytes() == Image.open(io.BytesIO((source_root / art).read_bytes())).convert('RGBA').tobytes()
        disabled = art.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN').replace('/PassiveButtons/PASBTN', '/CommandButtonsDisabled/DISBTN')
        assert Image.open(sample / ability['disabledIcon']).tobytes() == Image.open(io.BytesIO((source_root / disabled).read_bytes())).convert('RGBA').tobytes()
        if ability.get('offIcon'):
            off = ability['sourceFunc']['Unart'].replace('\\', '/')
            assert Image.open(sample / ability['offIcon']).tobytes() == Image.open(io.BytesIO((source_root / off).read_bytes())).convert('RGBA').tobytes()
            disabled = off.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
            assert Image.open(sample / ability['offIcon'].replace('.png', '-disabled.png')).tobytes() == Image.open(io.BytesIO((source_root / disabled).read_bytes())).convert('RGBA').tobytes()
    a = rules['abilities']
    assert a['Ainf']['damageBonus'] == .1 and a['Ainf']['armorBonus'] == 5 and a['Ainf']['autoRange'] == 5 and a['Ainf']['healthRegenBonus'] == 0
    assert a['Aslo']['movementReduction'] == .6 and a['Aslo']['attackSpeedReduction'] == .25
    assert a['Aply']['forms'] == dict(ground='nshe', air='nshf', amphibious='nsha', water='nshw')
    assert a['Afbk']['manaBurn'] == 20 and a['Afbk']['heroManaBurn'] == 4 and a['Afbk']['summonedDamage'] == 0
    assert a['Acmg']['requires'] == ['Rhss'] and a['Acmg']['healthManaRatio'] == .45 and a['Acmg']['currentHealthAdjustment'] == 1
    assert 'self' not in a['Aivs']['targets'] and 'nonhero' in a['Aply']['targets']
    assert a['Amim']['passive'] and a['Amim']['sourceRow']['race'] == 'nightelf'
    assert rules['boundAbilityRows'] == {key: tables['AbilityData'][key] for key in sorted({a for u in selected for a in u['abilities']})}
    node_receipt = json.loads((sample / 'human-sanctum-node-sources.json').read_bytes())
    assert len(models) == 7 and sum(len(m['parts']) for m in models.values()) == 44
    meshes = set(); billboards = 0
    for m in models.values():
        assert m['classic'] and m['boundsSource'] == 'nativeStand' and all(math.isfinite(v) and v > 0 for v in m['size'])
        assert any(a['name'].lower().startswith('stand') for a in m['animations'])
        for p in m['parts']:
            assert len(p['states']) == len(m['animations'])
            for ref in [p['mesh'], p['material'], p['placementMaterial'], *p['teamMaterials'].values(), *p['textureMaterials'].values()]: assert ref.split('#')[0] in expected, ref
            meshes.add(p['mesh'])
    for annotation in node_receipt['annotations']:
        mesh_path = annotation['path'].replace('Assets/WarcraftIII/', 'Assets/HumanSanctum/')
        if mesh_path not in meshes: continue
        doc = glb((sample / mesh_path).read_bytes())
        animation = doc['extras']['mengineMdxAnimation']; assert len(animation['nodes']) == len(doc['skins'][0]['joints'])
        assert doc['skins'][0]['joints'] == list(range(len(doc['skins'][0]['joints'])))
        meta = json.loads((source_root / 'Conversion' / annotation['metadata']).read_bytes())
        used = next(g['usedNodes'] for g in meta['geosets'] if g['geoset'] == annotation['geoset'])
        for i, old in enumerate(used):
            n = meta['nodes'][old]; assert doc['nodes'][i]['name'] == n['name']
            assert all(animation['nodes'][i][k] == n[k] for k in ['translation', 'rotation', 'scale'])
        for n in annotation['nodes']:
            assert doc['nodes'][n['node']]['extras']['mengineBillboard'] == dict(flags=n['flags']); billboards += 1
    assert billboards > 0
    assert digest(probe.read_bytes()) == receipt['poseProbeSha256']
    references = []
    for u in selected:
        m = models[u['model']]; ci = next((i for i, a in enumerate(m['animations']) if a['name'].lower() == 'stand'), next(i for i, a in enumerate(m['animations']) if a['name'].lower().startswith('stand')))
        visible = [p for p in m['parts'] if p['states'][ci][0][4] > .001]; body = [p for p in visible if not p['sourceFlags'] & 1] or visible
        references.append((m, [str(sample / p['mesh']) + '#pose=' + str(ci) + ':0' for p in body]))
    run = subprocess.run([str(probe), '--stdin'], input='\n'.join(r for _, refs in references for r in refs) + '\n', capture_output=True, text=True, check=True)
    boxes = iter(json.loads(line) for line in run.stdout.splitlines())
    for model, refs in references:
        bounds = [next(boxes) for _ in refs]
        for side, select in [('min', min), ('max', max)]:
            native = [select(b[side][i] for b in bounds) for i in range(3)]
            assert all(math.isclose(v, model['bounds'][side][i], rel_tol=1e-6, abs_tol=1e-6) for i, v in enumerate(native)), model['sourceModel']
    assert next(boxes, None) is None
    result = dict(passed=True, sources=len(receipt['sources']), signedFiles=len(expected), bytes=sum(r['bytes'] for r in expected.values()), models=len(models), parts=sum(len(m['parts']) for m in models.values()), materials=materials, icons=images, billboardNodes=billboards, nativeBounds=len(selected))
    print('PASS independently parsed Sanctum source rows, original command pixels, skin tracks, material identities and native model bounds')
    return result


def reproduce(sample, library, probe, reader):
    receipt = json.loads((sample / 'human-sanctum-sources.json').read_bytes())
    with tempfile.TemporaryDirectory(prefix='sanctum-reproduction-', dir=ROOT / 'tmp') as directory:
        work = pathlib.Path(directory); output = work / 'sample'
        command = [sys.executable, str(ROOT / 'scripts/import-frost-human-sanctum.py'), '--output', str(output), '--source-sample', str(sample), '--game', str(work / 'absent-game'), '--library', str(library), '--pose-probe', str(probe), '--metadata-reader', str(reader)]
        run = subprocess.run(command, capture_output=True, text=True, encoding='utf-8'); assert run.returncode == 0, run.stdout + run.stderr
        for record in receipt['files']:
            assert (output / record['path']).read_bytes() == (sample / record['path']).read_bytes(), record['path']
        assert (output / 'human-sanctum-sources.json').read_bytes() == (sample / 'human-sanctum-sources.json').read_bytes(), 'Reproduction receipt differs'
        # MiYu: protect signed outputs even when the requested regeneration would produce identical bytes.
        changed = output / 'Assets/Art/classic-sanctum-humanpriest.png'; changed.write_bytes(b'user-edited-icon')
        before = {p.relative_to(output).as_posix(): digest(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
        run = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
        assert run.returncode != 0 and 'Preserve edited output' in run.stderr, run.stderr
        after = {p.relative_to(output).as_posix(): digest(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
        assert before == after, 'Modified output failure wrote other files'
        unsigned = work / 'unsigned-output'; icon = unsigned / 'Assets/Art/classic-sanctum-humanpriest.png'; icon.parent.mkdir(parents=True); icon.write_bytes(b'user-owned-icon')
        command[command.index('--output') + 1] = str(unsigned)
        run = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
        assert run.returncode != 0 and 'Preserve unsigned output' in run.stderr, run.stderr
        assert [p for p in unsigned.rglob('*') if p.is_file()] == [icon] and icon.read_bytes() == b'user-owned-icon', 'Unsigned output failure wrote files'
        source = work / 'corrupt-source'; source.mkdir(); shutil.copy2(sample / 'human-sanctum-sources.json', source / 'human-sanctum-sources.json')
        raw = source / 'SourceAssets/HumanSanctum/Units/UnitBalance.slk'; raw.parent.mkdir(parents=True); raw.write_bytes(b'corrupt SLK')
        rejected = work / 'rejected-output'; command[command.index('--output') + 1] = str(rejected); command[command.index('--source-sample') + 1] = str(source)
        run = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
        assert run.returncode != 0 and 'Corrupt retained source' in run.stderr and not rejected.exists(), run.stderr
    print('PASS byte-identical reproduction without a game installation; modified output and corrupt retained source rejected before writes')
    return dict(reproducedFiles=len(receipt['files']) + 1, modifiedOutputProtected=True, unsignedOutputProtected=True, corruptSourceRejected=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sample', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--pose-probe', type=pathlib.Path, required=True)
    parser.add_argument('--reproduce', action='store_true')
    parser.add_argument('--library', type=pathlib.Path)
    parser.add_argument('--metadata-reader', type=pathlib.Path)
    parser.add_argument('--report', type=pathlib.Path)
    args = parser.parse_args(); result = verify(args.sample.resolve(), args.pose_probe.resolve())
    if args.reproduce:
        assert args.library and args.metadata_reader, 'Reproduction requires --library and --metadata-reader'
        result.update(reproduce(args.sample.resolve(), args.library.resolve(), args.pose_probe.resolve(), args.metadata_reader.resolve()))
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True); args.report.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))


if __name__ == '__main__': main()

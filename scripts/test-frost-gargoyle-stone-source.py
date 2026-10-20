"""Author: MiYu. Verify original Stone Form records, pixel-exact icons, offline replay and overwrite protection."""
import hashlib
import importlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import uuid
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp/docs-artifacts/frost-gargoyle-stone'
OUT.mkdir(parents=True, exist_ok=True)
SAMPLE = ROOT / 'samples/frostbound-realms'
SOURCE = SAMPLE / 'SourceAssets/GargoyleStone'
IMPORTER = ROOT / 'scripts/import-frost-gargoyle-stone.py'
RECEIPT = 'gargoyle-stone-sources.json'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
receipt = json.loads((SAMPLE / RECEIPT).read_bytes())
rules = json.loads((SAMPLE / 'gargoyle-stone.json').read_bytes())
paths = [record['path'] for record in receipt['files']] + [RECEIPT]
checks = []
sys.path.insert(0, str(ROOT / 'scripts'))
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-human-army').section


def run(source, output):
    return subprocess.run([sys.executable, str(IMPORTER), '--game', str(ROOT / 'tmp/absent-stone-game'), '--source-sample', str(source), '--output', str(output)], cwd=ROOT, capture_output=True)


for record in receipt['files']:
    raw = (SAMPLE / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
    parent = SAMPLE
    for part in Path(record['path']).parts:
        assert part in {p.name for p in parent.iterdir()}, 'Path casing differs on disk: ' + record['path']
        parent /= part
for record in receipt['sources']:
    raw = (SOURCE / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
    assert record['archivePath'] == record['path'] and record['archive'] in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq']
assert receipt['generatorSha256'] == sha(IMPORTER.read_bytes()) and receipt['originalRuntimeVerified'] is False
checks.append('all outputs and original MPQ sources match signed byte counts, hashes, generator and exact path casing')

a, r, immunity = rules['ability'], rules['research'], rules['magicImmunity']
assert (a['id'], a['castTime'], a['duration'], a['heroDuration'], a['mana'], a['cooldown']) == ('Astn', .7, .5, 0, 0, 30)
assert (a['normalUnit'], a['alternateUnit'], a['morphFlags'], a['heightAdjustmentTime'], a['landingDelay'], a['regenerationRate']) == ('ugar', 'ugrm', 7, .5, .5, 8)
assert (a['slot'], a['unSlot'], a['hotkey'], a['unhotkey'], a['order'], a['unorder'], a['requires']) == (8, 8, 'F', 'F', 'stoneform', 'unstoneform', ['Rusf'])
assert (r['id'], r['gold'], r['wood'], r['time'], r['slot'], r['hotkey'], r['requires']) == ('Rusf', 75, 150, 40, 10, 'S', ['ugrv', 'unp2'])
assert a['name'] == r['name'] == '\u77f3\u50cf\u5f62\u6001'
assert (immunity['id'], immunity['code'], immunity['damageFactor'], immunity['slot']) == ('ACmi', 'Amim', 0, 10)
ability_rows = rows((SOURCE / 'Units/AbilityData.slk').read_bytes())
assert a['sourceRow'] == ability_rows['Astn'] and immunity['sourceRow'] == ability_rows['ACmi']
assert r['sourceRow'] == rows((SOURCE / 'Units/UpgradeData.slk').read_bytes())['Rusf']
for value, prefix, identifier in [(a, 'UndeadAbility', 'Astn'), (r, 'UndeadUpgrade', 'Rusf'), (immunity, 'NeutralAbility', 'ACmi')]:
    for field, suffix in [('sourceFunc', 'Func'), ('sourceStrings', 'Strings')]:
        assert value[field] == section((SOURCE / ('Units/' + prefix + suffix + '.txt')).read_bytes(), identifier)
checks.append('Astn raw timings/data and F orders, Rusf 75/150/40 with Black Citadel prerequisite, ACmi Amim and localizations match complete originals')

for key, unit in rules['units'].items():
    for table, row in unit['sourceRows'].items(): assert row == rows((SOURCE / ('Units/' + table + '.slk')).read_bytes())[key]
    for field, suffix in [('sourceFunc', 'Func'), ('sourceStrings', 'Strings')]: assert unit[field] == section((SOURCE / ('Units/UndeadUnit' + suffix + '.txt')).read_bytes(), key)
    assert (unit['hp'], unit['healthRegen'], unit['regenerationType'], unit['modelScale'], unit['attachmentAnimProps']) == (410, 2, 'blight', 1, ['medium'])
normal, stone = rules['units']['ugar'], rules['units']['ugrm']
assert (normal['speed'], normal['armorValue'], normal['collision'], normal['movementType'], normal['moveHeight'], normal['moveFloor'], normal['weaponsEnabled'], normal['castPoint']) == (3.5, 3, .08, 'fly', 2.4, .9, 3, 0)
assert (stone['speed'], stone['armorValue'], stone['collision'], stone['movementType'], stone['moveHeight'], stone['moveFloor'], stone['weaponsEnabled'], stone['castPoint']) == (0, 15, .32, 'foot', 0, 0, 0, .5)
assert stone['targetTypes'] == ['ground'] and stone['abilities'] == ['Astn', 'ACmi'] and stone['attachmentLinkProps'] == ['alternate']
assert normal['targetTypes'] == ['air'] and normal['abilities'] == ['Astn'] and normal['attachmentLinkProps'] == []
assert normal['model'] == stone['model'] and normal['armorUpgrade'] == stone['armorUpgrade'] == 2 and normal['castBackswing'] == stone['castBackswing'] == .51
checks.append('both complete five-table unit records retain forms, base regeneration, ground/air, immunity list, cast points and original model/attachment properties')

metadata = rows((SOURCE / 'Units/AbilityMetaData.slk').read_bytes())
expected_keys = {'atar', 'acas', 'adur', 'ahdu', 'acdn', 'amcs', 'aare', 'aran', 'Eme1', 'Eme2', 'Eme3', 'Eme4', 'ave5', 'Emeu', 'mim1'}
assert set(rules['metadata']) == expected_keys
editor_strings = dict(line.split('=', 1) for line in (SOURCE / 'UI/WorldEditStrings.txt').read_text(encoding='utf-8').splitlines() if '=' in line and not line.startswith('//'))
for key, value in rules['metadata'].items():
    assert value == metadata[key] and a['sourceFieldLabels'][value['displayName']] == editor_strings[value['displayName']]
assert a['sourceFieldLabels']['WESTRING_AEVAL_AVE5'] == '\u751f\u547d\u56de\u590d\u7387(\u6bcf\u79d2)'
flags = rules['morphFlags']
assert flags['sourceFields'] == section((SOURCE / 'UI/UnitEditorData.txt').read_bytes(), 'morphFlags')
assert flags['sourceFields']['NumValues'] == '5'
assert flags['sourceLabels'] == {key: value for key, value in editor_strings.items() if key.startswith('WESTRING_UE_MORPHFLAGS_')}
checks.append('15 exact metadata records, Chinese source labels and all original morph flag index/string entries retained without runtime inference')

for value, art in [(a, a['sourceFunc']['Art']), (a['unicons'], a['sourceFunc']['Unart']), (r, r['sourceFunc']['Art']), (immunity, immunity['sourceFunc']['Art'])]:
    for disabled in [False, True]:
        source = art.replace('\\', '/')
        if disabled: source = source.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN').replace('/PassiveButtons/PASBTN', '/CommandButtonsDisabled/DISPASBTN')
        target = value['disabledIcon' if disabled else 'icon']
        with Image.open(io.BytesIO((SOURCE / source).read_bytes())) as original, Image.open(SAMPLE / target) as output:
            assert output.size == (64, 64) and output.mode == 'RGBA' and output.tobytes() == original.convert('RGBA').tobytes()
        meta = json.loads((SAMPLE / (target + '.meta')).read_bytes())
        assert meta['guid'] == str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + target))
checks.append('all eight ability/unstone/research/immunity PNGs exactly match original enabled/disabled BLP RGBA pixels and deterministic GUIDs')

with tempfile.TemporaryDirectory(prefix='stone-source-', dir=OUT) as temporary:
    temp = Path(temporary).resolve(); assert temp.parent == OUT.resolve()
    replay = temp / 'replay'; result = run(SAMPLE, replay)
    assert result.returncode == 0, result.stderr.decode('utf-8', errors='replace')
    assert all((SAMPLE / p).read_bytes() == (replay / p).read_bytes() for p in paths)
    result = run(replay, replay)
    assert result.returncode == 0 and all((SAMPLE / p).read_bytes() == (replay / p).read_bytes() for p in paths)
    checks.append('standalone offline replay without game archives and in-place regeneration equal all delivered files byte-for-byte')
    edited = replay / a['icon']; edited.write_bytes(edited.read_bytes() + b'local-edit')
    before = {p: (replay / p).read_bytes() for p in paths}; result = run(SAMPLE, replay)
    assert result.returncode != 0 and b'Preserve edited output' in result.stderr
    assert all((replay / p).read_bytes() == raw for p, raw in before.items())
    checks.append('locally edited generated output rejects regeneration before changing any delivered file')
    source = temp / 'source'; source.mkdir(); shutil.copy2(SAMPLE / RECEIPT, source / RECEIPT); shutil.copytree(SOURCE, source / 'SourceAssets/GargoyleStone')
    damaged = source / 'SourceAssets/GargoyleStone/Units/AbilityData.slk'; damaged.write_bytes(damaged.read_bytes() + b'corrupt'); output = temp / 'rejected'; result = run(source, output)
    assert result.returncode != 0 and b'Corrupt retained source' in result.stderr and not output.exists()
    checks.append('changed retained original rejects offline replay before creating output')
    unowned = temp / 'unowned'; unowned.mkdir(); target = unowned / 'gargoyle-stone.json'; target.write_bytes(b'local rules'); result = run(SAMPLE, unowned)
    assert result.returncode != 0 and b'Preserve edited output' in result.stderr and target.read_bytes() == b'local rules'
    assert list(unowned.iterdir()) == [target]
    checks.append('preexisting unowned rules remain untouched and no partial import is written')

report = dict(passed=len(checks), failed=0, checks=checks, generatedFiles=len(receipt['files']), originalSources=len(receipt['sources']), rulesSha256=sha((SAMPLE / 'gargoyle-stone.json').read_bytes()), receiptSha256=sha((SAMPLE / RECEIPT).read_bytes()))
(OUT / 'import-check.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))

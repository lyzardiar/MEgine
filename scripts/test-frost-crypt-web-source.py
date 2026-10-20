"""Author: MiYu. Verify Web extraction contracts, deterministic offline replay and overwrite protection."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp/docs-artifacts/frost-crypt-web'
OUT.mkdir(parents=True, exist_ok=True)
SAMPLE = ROOT / 'samples/frostbound-realms'
IMPORTER = ROOT / 'scripts/import-frost-crypt-web.py'
RECEIPT = 'crypt-web-sources.json'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
receipt = json.loads((SAMPLE / RECEIPT).read_bytes())
rules = json.loads((SAMPLE / 'crypt-web.json').read_bytes())
paths = [record['path'] for record in receipt['files']] + [RECEIPT]
checks = []


def run(source, output):
    return subprocess.run([sys.executable, str(IMPORTER), '--game', str(ROOT / 'tmp/absent-web-game'), '--source-sample', str(source), '--output', str(output)], cwd=ROOT, capture_output=True)


for record in receipt['files']:
    raw = (SAMPLE / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
    parent = SAMPLE
    for part in Path(record['path']).parts:
        assert part in {p.name for p in parent.iterdir()}, 'Path casing differs on disk: ' + record['path']
        parent /= part
for record in receipt['sources']:
    raw = (SAMPLE / 'SourceAssets/CryptWeb' / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
    assert record['archivePath'].casefold() == record['path'].casefold()
assert receipt['generatorSha256'] == sha(IMPORTER.read_bytes())
checks.append('all generated and retained source bytes match their signed receipt')

a, r, c = rules['ability'], rules['research'], rules['caster']
assert (a['id'], a['duration'], a['heroDuration'], a['mana'], a['cooldown'], a['range']) == ('Aweb', 12, 7, 0, 12, 4)
assert (a['landingTime'], a['airHeight'], a['meleeRange'], a['missileSpeed'], a['missileHoming']) == (.6, 2, 1.28, 15, True)
assert (a['slot'], a['hotkey'], a['order'], a['autoOn'], a['autoOff']) == (8, 'W', 'web', 'webon', 'weboff')
assert (r['id'], r['gold'], r['wood'], r['time'], r['slot'], r['hotkey'], r['requires']) == ('Ruwb', 150, 150, 30, 9, 'W', ['ugrv', 'unp1'])
assert (c['sourceUnit'], c['castPoint'], c['castBackswing'], c['autoAbility']) == ('ucry', 0, .51, 'Aweb')
assert rules['sourceUnitsPerWorldUnit'] == 100 and rules['misc']['WebIsMagic'] == 0
assert (rules['units']['ugar']['moveHeight'], rules['units']['ugar']['moveFloor']) == (2.4, .9)
assert rules['magicRule']['magicalWhenNonzero'] is True
assert set(rules['buffs']) == {'Bwea', 'Bweb'} and set(rules['metadata']) == {'Ens1', 'Ens2', 'Ens3'}
assert a['sourceFieldLabels']['WESTRING_AEVAL_ENS1'] == '\u7a7a\u519b\u5355\u4f4d\u5760\u843d\u6301\u7eed\u65f6\u95f4'
assert a['sourceFieldLabels']['WESTRING_AEVAL_ENS2'] == '\u7a7a\u4e2d\u5355\u4f4d\u9ad8\u5ea6'
assert a['sourceFieldLabels']['WESTRING_AEVAL_ENS3'] == '\u8fd1\u6218\u653b\u51fb\u8303\u56f4'
assert a['name'] == '\u86db\u7f51' and r['name'] == '\u86db\u7f51'
checks.append('original ability, research, metadata labels, cast timing and physical/magical switch')

for record in receipt['files']:
    if record['path'].endswith('.png'):
        with Image.open(SAMPLE / record['path']) as image: assert image.size == (64, 64) and image.mode == 'RGBA'
models = [a['missile']] + [v['model'] for v in rules['buffs'].values()]
assert len({v['path'] for v in models}) == 3
for model in models:
    assert (SAMPLE / 'SourceAssets/CryptWeb' / model['path']).read_bytes()[:4] == b'MDLX'
    for texture in model['textures']: assert (SAMPLE / 'SourceAssets/CryptWeb' / texture).is_file()
checks.append('eight RGBA icons and three complete MDX texture dependency sets')

with tempfile.TemporaryDirectory(prefix='import-check-', dir=OUT) as temp:
    temp = Path(temp); replay = temp / 'replay'
    result = run(SAMPLE, replay)
    assert result.returncode == 0, result.stderr.decode('utf-8', errors='replace')
    assert all((SAMPLE / p).read_bytes() == (replay / p).read_bytes() for p in paths)
    checks.append('offline replay equals all delivered files byte-for-byte, including receipt')
    result = run(replay, replay)
    assert result.returncode == 0 and all((SAMPLE / p).read_bytes() == (replay / p).read_bytes() for p in paths)
    checks.append('offline in-place regeneration is idempotent')
    edited = replay / 'Assets/Art/classic-crypt-web.png'; edited.write_bytes(edited.read_bytes() + b'local-edit')
    before = {p: (replay / p).read_bytes() for p in paths}
    result = run(SAMPLE, replay)
    assert result.returncode != 0 and b'Preserve edited output' in result.stderr
    assert all((replay / p).read_bytes() == raw for p, raw in before.items())
    checks.append('edited generated output rejects regeneration without modifying any delivered file')
    source = temp / 'source'; source.mkdir()
    shutil.copy2(SAMPLE / RECEIPT, source / RECEIPT)
    shutil.copytree(SAMPLE / 'SourceAssets/CryptWeb', source / 'SourceAssets/CryptWeb')
    damaged = source / 'SourceAssets/CryptWeb/Units/AbilityData.slk'; damaged.write_bytes(damaged.read_bytes() + b'corrupt')
    output = temp / 'rejected'
    result = run(source, output)
    assert result.returncode != 0 and b'Corrupt retained source' in result.stderr and not output.exists()
    checks.append('corrupt retained source rejects replay before producing output')

report = dict(passed=len(checks), failed=0, checks=checks, generatedFiles=len(receipt['files']), originalSources=len(receipt['sources']), rulesSha256=sha((SAMPLE / 'crypt-web.json').read_bytes()), receiptSha256=sha((SAMPLE / RECEIPT).read_bytes()))
(OUT / 'import-check.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))

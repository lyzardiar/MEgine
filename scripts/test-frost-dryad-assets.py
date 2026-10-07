"""Author: MiYu. Check Dryad source identity, regenerated output and edited-file protection."""
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base = importlib.import_module('import-frost-druids')
ROOT, SAMPLE, sha = base.ROOT, base.SAMPLE, base.sha
receipt = json.loads((SAMPLE / 'dryad-sources.json').read_bytes())
for p, expected in receipt['generators'].items(): assert sha((ROOT / p).read_bytes()) == expected, p
for record in receipt['files']:
    raw = (SAMPLE / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
for record in receipt['sources']:
    p = record['path'].replace('\\', '/'); raw = (SAMPLE / 'SourceAssets/WarcraftIII' / p).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], p
rules = json.loads((SAMPLE / 'dryad-rules.json').read_bytes()); unit = rules['units']['dryad']
assert (unit['hp'], unit['damage'], unit['range'], unit['cooldown'], unit['speed']) == (435,18,5,2,3.5)
assert (unit['maxMana'], unit['initialMana'], unit['manaRegen'], unit['armor']) == (200,75,.75,'unarmored')
for name, row in unit['sourceRows'].items(): assert base.rows((SAMPLE / 'SourceAssets/WarcraftIII/Units' / (name + '.slk')).read_bytes())['edry'] == row
assert rules['abilities']['Aspo']['sourceRow']['DataD1'] == '1'
assert rules['runtimeIntegration'] == 'Pending' and len(rules['unverified']) == 2
models = json.loads((SAMPLE / 'dryad-models.json').read_bytes())
assert set(models) == {'ClassicDryad','ClassicDryadPortrait','ClassicDryadMissile','ClassicDispelMagicTarget'}
for key, model in models.items():
    assert model['classic'] and model['boundsSource'] == 'nativeStand' and model['animations'] and model['parts'], key
    for part in model['parts']:
        assert (SAMPLE / part['mesh']).is_file() and (SAMPLE / part['material']).is_file(), key
with tempfile.TemporaryDirectory(prefix='test-frost-dryad-') as temp:
    output = pathlib.Path(temp); command = [sys.executable, str(ROOT / 'scripts/import-frost-dryad-assets.py'), '--output', temp]
    result = subprocess.run(command, capture_output=True)
    assert result.returncode == 0, result.stderr.decode('utf-8', 'replace')
    for record in receipt['files']: assert (output / record['path']).read_bytes() == (SAMPLE / record['path']).read_bytes(), record['path']
    assert json.loads((output / 'dryad-sources.json').read_bytes()) == receipt
    edited = output / 'dryad-rules.json'; edited.write_bytes(b'{}\n')
    before = {p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    result = subprocess.run(command, capture_output=True)
    assert result.returncode != 0 and b'Preserve modified Dryad output' in result.stderr
    assert before == {p.relative_to(output).as_posix():sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
print('PASS Dryad source identities, native Stand bounds, exact regeneration and protected writes:', len(receipt['files']), 'signed outputs')

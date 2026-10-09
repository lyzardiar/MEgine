"""Author: MiYu. Verify source Orc hero bindings, asset integrity and reproducible protected imports."""
import hashlib
import io
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'


def sha(raw): return hashlib.sha256(raw).hexdigest()
def read(path): return json.loads(path.read_bytes())


def main():
    rules, receipt = read(SAMPLE / 'orc-hero-rules.json'), read(SAMPLE / 'orc-hero-sources.json')
    expected = {'Obla': ('剑圣', ['AOwk', 'AOmi', 'AOcr', 'AOww']), 'Ofar': ('先知', ['AOcl', 'AOfs', 'AOsf', 'AOeq']), 'Otch': ('牛头人酋长', ['AOsh', 'AOws', 'AOae', 'AOre']), 'Oshd': ('暗影猎手', ['AOhw', 'AOhx', 'AOsw', 'AOvd'])}
    assert rules['heroes'] == list(expected) == rules['altar']['sourceFunc']['Trains'].split(',')
    assert not rules['runtimeIntegrated'] and not rules['originalRuntimeVerified']
    assert len(rules['abilities']) == 16 and sum(len(a['levels']) for a in rules['abilities'].values()) == 40
    for key, (name, abilities) in expected.items():
        u = rules['units'][key]
        assert u['name'] == name and u['commandOrder'] == abilities
        assert set(u['abilityIds']) == set(u['sourceRows']['UnitAbilities']['heroAbilList'].split(',')) == set(abilities)
        for index, ability in enumerate(abilities):
            a = rules['abilities'][ability]
            assert a['owner'] == key and a['slot'] == 8 + index and a['researchSlot'] == index
            assert len(a['levels']) == (1 if index == 3 else 3)
            assert a['requiredLevel'] == (6 if index == 3 else 1)
            assert a['name'] and '\ufffd' not in a['name']
            for level in a['levels']:
                for buff in level['buffs']:
                    if buff not in ['', '_', '-']: assert buff in rules['buffs']
    assert [rules['units']['Obla'][k] for k in ['strength', 'agility', 'intelligence']] == [18, 24, 16]
    assert rules['abilities']['AOcr']['sourceFunc']['Art'].endswith('PASBTNCriticalStrike.blp')
    assert rules['abilities']['AOcr']['sourceFunc']['Researchart'].endswith('BTNCriticalStrike.blp')
    assert rules['abilities']['AOre']['levels'][0]['cooldown'] > 0
    assert rules['abilities']['AOww']['levels'][0]['duration'] > 0
    for record in receipt['sources']:
        raw = (SAMPLE / record['output']).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
    icons = 0
    for record in receipt['outputs']:
        raw = (SAMPLE / record['path']).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
        if record['path'].endswith('.png'):
            image = Image.open(io.BytesIO(raw)); image.load()
            assert image.size == (64, 64) and image.mode == 'RGBA'
            icons += 1
    assert icons == 72
    for record in receipt['generators']: assert sha((ROOT / record['path']).read_bytes()) == record['sha256'], record['path']
    with tempfile.TemporaryDirectory(prefix='orc-hero-validation-', dir=ROOT / 'tmp') as temp:
        work = pathlib.Path(temp)
        assert work.parent.resolve() == (ROOT / 'tmp').resolve()
        output = work / 'repro'
        command = [sys.executable, str(ROOT / 'scripts/import-frost-orc-heroes.py'), '--source-root', str(SAMPLE), '--output', str(output), '--game', str(work / 'missing-game')]
        result = subprocess.run(command, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        for record in receipt['outputs']: assert (output / record['path']).read_bytes() == (SAMPLE / record['path']).read_bytes(), record['path']
        assert (output / 'orc-hero-sources.json').read_bytes() == (SAMPLE / 'orc-hero-sources.json').read_bytes()
        victim = next(r['path'] for r in receipt['outputs'] if r['path'].endswith('.png'))
        (output / victim).write_bytes((output / victim).read_bytes() + b'x')
        before = {r['path']: sha((output / r['path']).read_bytes()) for r in receipt['outputs']}
        result = subprocess.run(command, capture_output=True, text=True)
        assert result.returncode != 0 and 'Modified generated output' in result.stderr
        assert before == {r['path']: sha((output / r['path']).read_bytes()) for r in receipt['outputs']}
        bad_source = work / 'bad-source'
        bad_source.mkdir(); shutil.copyfile(SAMPLE / 'orc-hero-sources.json', bad_source / 'orc-hero-sources.json')
        for record in receipt['sources']:
            target = bad_source / record['output']; target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((SAMPLE / record['output']).read_bytes())
        victim = bad_source / receipt['sources'][0]['output']; victim.write_bytes(victim.read_bytes() + b'x')
        rejected_output = work / 'rejected'
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/import-frost-orc-heroes.py'), '--source-root', str(bad_source), '--output', str(rejected_output), '--game', str(work / 'missing-game')], capture_output=True, text=True)
        assert result.returncode != 0 and 'Source fingerprint mismatch' in result.stderr and not rejected_output.exists()
    print('PASS: four source Orc heroes, 16 skills/40 ranks, original altar/card bindings, 72 RGBA icons, all source/output/tool hashes, offline byte-identical regeneration, modified-output protection and damaged-source rejection')


if __name__ == '__main__': main()

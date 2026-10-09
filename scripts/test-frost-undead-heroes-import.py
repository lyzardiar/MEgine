"""Author: MiYu. Verify original Undead hero bindings, icons, buff aliases and protected offline imports."""
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
    rules, receipt = read(SAMPLE / 'undead-hero-rules.json'), read(SAMPLE / 'undead-hero-sources.json')
    expected = {'Udea': ('死亡骑士', ['AUdc', 'AUdp', 'AUau', 'AUan']), 'Ulic': ('巫妖', ['AUfn', 'AUfu', 'AUdr', 'AUdd']), 'Udre': ('恐惧魔王', ['AUcs', 'AUsl', 'AUav', 'AUin']), 'Ucrl': ('地穴领主', ['AUim', 'AUts', 'AUcb', 'AUls'])}
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
    assert [rules['units']['Udea'][k] for k in ['strength', 'agility', 'intelligence']] == [23, 12, 17]
    assert [rules['units'][k]['selectionScale'] for k in expected] == [1.85, 1.25, 1.5, 1.85]
    assert rules['abilities']['AUav']['sourceFunc']['Art'].endswith('PASBTNVampiricAura.blp')
    assert rules['buffs']['Bust']['sourceAlias'] == 'BUst' and rules['buffs']['Bust']['sourceRow']['alias'] == 'BUst'
    assert 'Bust' in rules['abilities']['AUsl']['levels'][0]['buffs']
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
    with tempfile.TemporaryDirectory(prefix='undead-hero-validation-', dir=ROOT / 'tmp') as temp:
        work = pathlib.Path(temp)
        assert work.parent.resolve() == (ROOT / 'tmp').resolve()
        output = work / 'repro'
        command = [sys.executable, str(ROOT / 'scripts/import-frost-undead-heroes.py'), '--source-root', str(SAMPLE), '--output', str(output), '--game', str(work / 'missing-game')]
        result = subprocess.run(command, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        for record in receipt['outputs']: assert (output / record['path']).read_bytes() == (SAMPLE / record['path']).read_bytes(), record['path']
        assert (output / 'undead-hero-sources.json').read_bytes() == (SAMPLE / 'undead-hero-sources.json').read_bytes()
        victim = next(r['path'] for r in receipt['outputs'] if r['path'].endswith('.png'))
        (output / victim).write_bytes((output / victim).read_bytes() + b'x')
        before = {r['path']: sha((output / r['path']).read_bytes()) for r in receipt['outputs']}
        result = subprocess.run(command, capture_output=True, text=True)
        assert result.returncode != 0 and 'Modified generated output' in result.stderr
        assert before == {r['path']: sha((output / r['path']).read_bytes()) for r in receipt['outputs']}
        bad_source = work / 'bad-source'
        bad_source.mkdir(); shutil.copyfile(SAMPLE / 'undead-hero-sources.json', bad_source / 'undead-hero-sources.json')
        for record in receipt['sources']:
            target = bad_source / record['output']; target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((SAMPLE / record['output']).read_bytes())
        victim = bad_source / receipt['sources'][0]['output']; victim.write_bytes(victim.read_bytes() + b'x')
        rejected_output = work / 'rejected'
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/import-frost-undead-heroes.py'), '--source-root', str(bad_source), '--output', str(rejected_output), '--game', str(work / 'missing-game')], capture_output=True, text=True)
        assert result.returncode != 0 and 'Source fingerprint mismatch' in result.stderr and not rejected_output.exists()
    print('PASS: four source Undead heroes, 16 skills/40 ranks, original altar/card bindings, 72 RGBA icons, all source/output/tool hashes, offline byte-identical regeneration, modified-output protection and damaged-source rejection')


if __name__ == '__main__': main()

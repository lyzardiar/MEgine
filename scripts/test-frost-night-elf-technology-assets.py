"""Author: MiYu. Verify original research coverage, source semantics, icons and safe reproducible import."""
import hashlib
import importlib
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
sys.path.insert(0, str(ROOT / 'scripts'))
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-natures-blessing').section
sha = lambda raw: hashlib.sha256(raw).hexdigest()
receipt = json.loads((SAMPLE / 'night-elf-technology-sources.json').read_bytes())
catalog = json.loads((SAMPLE / 'night-elf-technology.json').read_bytes())
assert sha((ROOT / receipt['generator']).read_bytes()) == receipt['generatorSha256']
for record in receipt['sources']:
    raw = (SAMPLE / 'SourceAssets/WarcraftIII' / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
for record in receipt['files']:
    raw = (SAMPLE / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
research, units, special = [catalog[k] for k in ['research', 'units', 'specialRules']]
expected_costs = {
    'Resc': [(100, 100, 20)], 'Reib': [(50, 100, 35)], 'Remk': [(100, 175, 40)], 'Remg': [(100, 150, 35)], 'Repb': [(125, 100, 60)],
    'Resm': [(125, 75, 60), (175, 175, 75), (225, 275, 90)], 'Rema': [(150, 75, 60), (200, 150, 75), (250, 225, 90)],
    'Resw': [(100, 75, 60), (175, 175, 75), (250, 275, 90)], 'Rerh': [(150, 50, 60), (200, 150, 75), (250, 250, 90)],
    'Reuv': [(50, 50, 45)], 'Rews': [(75, 150, 30)],
}
expected_requirements = {'Resc': [['edob', 'etoa']], 'Reib': [['etoa']], 'Remk': [['edob', 'etoe']], 'Remg': [['edob', 'etoe']], 'Repb': [['etoa', 'edob']], 'Reuv': [[]], 'Rews': [['etoe']]}
for key in ['Resm', 'Rema', 'Resw', 'Rerh']: expected_requirements[key] = [[], ['etoa'], ['etoe']]
assert set(research) == set(expected_costs) and sum(r['maxLevel'] for r in research.values()) == 19
balance = rows((SAMPLE / 'SourceAssets/WarcraftIII/Units/UnitBalance.slk').read_bytes())
strings = (SAMPLE / 'SourceAssets/WarcraftIII/Units/NightElfUpgradeStrings.txt').read_bytes()
icons = set()
for key, r in research.items():
    assert [(v['gold'], v['wood'], v['time']) for v in r['levels']] == expected_costs[key]
    assert [[v['id'] for v in level['requires']] for level in r['levels']] == expected_requirements[key]
    assert all(v['amount'] == 1 for level in r['levels'] for v in level['requires'])
    assert r['units'] == sorted(k for k, v in balance.items() if key in v.get('upgrades', '').split(','))
    assert [v['name'] for v in r['levels']] == section(strings, key)['Name'].split(',')
    for level in r['levels']:
        assert level['name'] and '\ufffd' not in level['name'] and len(level['hotkey']) == 1
        for field in ['icon', 'disabledIcon']:
            icons.add(level[field])
            with Image.open(SAMPLE / level[field]) as icon: assert icon.size == (64, 64) and icon.mode == 'RGBA'
    assert r['building'] in catalog['buildings'] and key in catalog['buildings'][r['building']]['researches']
assert len(icons) == 38
for building in catalog['buildings']:
    slots = [r['slot'] for r in research.values() if r['building'] == building]
    assert len(slots) == len(set(slots)), 'Original command slots must not overlap'
assert research['Resm']['units'] == ['earc', 'ebal', 'ehpr', 'ensh', 'esen', 'eshd', 'nhea']
assert research['Rema']['units'] == ['earc', 'ehpr', 'ensh', 'esen', 'eshd', 'nhea']
assert research['Resw']['units'] == ['echm', 'edcm', 'edry', 'edtm', 'efdr', 'ehip', 'emtg']
assert research['Rerh']['units'] == research['Resw']['units']
assert 'edoc' not in research['Resw']['units'] and 'edot' not in research['Resw']['units']
assert [level['effects']['ratd'] for level in research['Resm']['levels']] == [1, 2, 3]
assert units['earc']['weapons']['1']['averageDiceDamage'] == units['esen']['weapons']['1']['averageDiceDamage'] == 2
assert units['ebal']['weapons']['1']['averageDiceDamage'] == 9.5
assert all(units[key]['armorPerRank'] == 2 for key in research['Rema']['units'] + research['Rerh']['units'])
assert research['Reib']['levels'][0]['effects'] == {'ratr': 200}
assert research['Remk']['levels'][0]['effects'] == {'ratx': 3}
assert special['moonGlaive'] == dict(sourceUnit='esen', originalTargets=2, upgradedTargets=3, damageLoss=.5)
sentinel = special['sentinel']
assert (sentinel['usesPerUnit'], sentinel['range'], sentinel['mana'], sentinel['duration'], sentinel['flightSight'], sentinel['perchedSight'], sentinel['perchedHeight'], sentinel['count']) == (1, 800, 0, 0, 100, 900, 275, 1)
assert sentinel['durationZeroMeansUnlimited'] and sentinel['detectsInvisible'] and sentinel['dispellable'] and sentinel['removedOnAnchoredTreeDamage']
assert sentinel['sourceRow']['Cool1'] == '120', 'The source cooldown must not become repeated owl uses'
assert sentinel['missileSpeed'] == 1500 and sentinel['sourceFunc']['Missileart'] == sentinel['sourceBuffFunc']['Targetart'] == r'Units\NightElf\Owl\Owl.mdl'
assert catalog['treeRules']['hp'] == 50 and catalog['treeRules']['armorMaterial'] == 'Wood'
assert all(row['HP'] == '50' and row['targType'] == 'tree' for row in catalog['treeRules']['sourceRows'].values())
commands = catalog['commands']
assert (commands['Aesn']['hotkey'], commands['Aesn']['slot'], commands['Ambt']['hotkey'], commands['Ambt']['slot']) == ('E', 8, 'R', 0)
for command in commands.values():
    for field in ['icon', 'offIcon', 'disabledIcon']:
        with Image.open(SAMPLE / command[field]) as icon: assert icon.size == (64, 64) and icon.mode == 'RGBA'
assert special['vorpalBlades']['enabledWeaponMask'] == 2 and special['vorpalBlades']['spillDistanceBonus'] == 200 and special['vorpalBlades']['spillRadius'] == 50 and special['vorpalBlades']['minRange'] == 250
assert 'tree' not in units['ebal']['weapons']['1']['targets'] and 'tree' in units['ebal']['weapons']['2']['targets']
assert not special['vorpalBlades']['attackGroundSpills'] and not special['vorpalBlades']['spillDamagesTrees']
assert special['ultravision']['nightSightEqualsDaySight'] and special['ultravision']['units'] == research['Reuv']['units']
well = special['wellSpring']
assert units['emow']['hpRegenType'] == 'none' and well['sourceAbilityRow']['DataE1'] == '1' and well['regeneratesOnlyAtNight'], 'Mana night restriction comes from Ambt, not HP regeneration type'
assert (units['emow']['initialMana'], well['upgradedMaxMana'], well['upgradedManaRegen'], well['manaRegenMultiplier']) == (100, 425, 1.9, 1.52)
assert well['healthPerWellMana'] == 2 and well['targetManaPerWellMana'] == .5
assert '%' in research['Rews']['effects'][1]['sourceLabels']['mnrb']
print('PASS original research: 11 IDs / 19 ranks, exact costs, prerequisites, localization, slots, unit bindings and 38 RGBA icons')
print('PASS source effects: dice-specific attack, unit armor, bows, marksmanship, three glaive targets, single-use owl, weapon-2 tree rules, night vision and percent well regeneration')

with tempfile.TemporaryDirectory(prefix='frost-night-elf-tech-') as name:
    directory = pathlib.Path(name); output = directory / 'output'
    args = [sys.executable, str(ROOT / receipt['generator']), '--output', str(output), '--game', str(directory / 'not-installed')]
    result = subprocess.run(args, cwd=ROOT, capture_output=True)
    assert result.returncode == 0, result.stderr.decode('utf8', errors='replace')
    for record in receipt['files']: assert (output / record['path']).read_bytes() == (SAMPLE / record['path']).read_bytes(), record['path']
    assert (output / 'night-elf-technology-sources.json').read_bytes() == (SAMPLE / 'night-elf-technology-sources.json').read_bytes()
    icon = output / research['Resm']['levels'][0]['icon']; icon.write_bytes(icon.read_bytes() + b'artist edit')
    (output / research['Resm']['levels'][1]['icon']).unlink()
    snapshot = lambda: {p.relative_to(output).as_posix(): sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    before = snapshot()
    result = subprocess.run(args, cwd=ROOT, capture_output=True)
    assert result.returncode != 0 and b'Preserve modified' in result.stderr
    assert snapshot() == before, 'Rejected import must not create the missing output or alter any file'
    cloned = directory / 'signed-inputs'
    for record in receipt['sources']:
        target = cloned / 'SourceAssets/WarcraftIII' / record['path']; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(SAMPLE / 'SourceAssets/WarcraftIII' / record['path'], target)
    for filename in ['night-elf-technology', 'natures-blessing', 'ancient-war', 'wisp-rule', 'detonate']:
        shutil.copyfile(SAMPLE / (filename + '-sources.json'), cloned / (filename + '-sources.json'))
    corrupt = cloned / 'SourceAssets/WarcraftIII/Units/UpgradeData.slk'; corrupt.write_bytes(corrupt.read_bytes() + b'corrupt')
    rejected = directory / 'rejected'
    invoke = "import importlib,pathlib,sys;sys.path.insert(0,sys.argv[1]);m=importlib.import_module('import-frost-night-elf-technology');m.SAMPLE=pathlib.Path(sys.argv[2]);sys.argv=['import','--output',sys.argv[3],'--game',sys.argv[4]];m.main()"
    result = subprocess.run([sys.executable, '-c', invoke, str(ROOT / 'scripts'), str(cloned), str(rejected), str(directory / 'not-installed')], cwd=ROOT, capture_output=True)
    assert result.returncode != 0 and b'Invalid signed source: Units/UpgradeData.slk' in result.stderr
    assert not rejected.exists(), 'Invalid signed input must be rejected before output writes'
print('PASS repeatable import: byte-exact without game installation, atomic modified-output protection, corrupt-source rejection before writes')
index_checks = None
if '--index' in sys.argv:
    check = [(receipt['generator'], receipt['generatorSha256'])] + [('samples/frostbound-realms/' + r['path'], r['sha256']) for r in receipt['files']]
    check.append(('samples/frostbound-realms/night-elf-technology-sources.json', sha((SAMPLE / 'night-elf-technology-sources.json').read_bytes())))
    response = subprocess.run(['git', 'cat-file', '--batch'], input=('\n'.join(':' + p for p, _ in check) + '\n').encode(), cwd=ROOT, capture_output=True, check=True)
    stream = io.BytesIO(response.stdout)
    for path, expected in check:
        header = stream.readline().split(); assert len(header) == 3 and header[1] == b'blob', path
        raw = stream.read(int(header[2])); assert stream.read(1) == b'\n' and sha(raw) == expected, 'Invalid staged signed file: ' + path
    assert not stream.read()
    index_checks = len(check)
    print('PASS staged byte/hash validation:', index_checks, 'generator, receipt and signed outputs in one Git batch')
report = dict(author='MiYu', passed=True, researchIds=11, researchRanks=19, icons=len(icons), sources=len(receipt['sources']), signedFiles=len(receipt['files']), catalogSha256=sha((SAMPLE / 'night-elf-technology.json').read_bytes()), regenerationWithoutInstallation=True, byteExact=True, preservesModifiedOutputAtomically=True, rejectsCorruptInputBeforeWrites=True, stagedChecks=index_checks, abilityCommands=2, abilityIcons=6, sourceTreeHp=50, sentinelSourceArt=True, runtimeResearchAcceptance=False)
(ROOT / 'docs/designs/frostbound-realms/night-elf-technology-art-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')

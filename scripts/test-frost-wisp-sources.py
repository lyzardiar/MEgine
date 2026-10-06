"""Author: MiYu. Verify original balance tables, reproducible generation and modified-output protection."""
import importlib.util
import json
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
spec = importlib.util.spec_from_file_location('wisp_rules', ROOT / 'scripts/import-frost-wisp-rules.py')
rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)
manifest = json.loads((SAMPLE / 'wisp-rule-sources.json').read_bytes())
assert rules.sha((ROOT / manifest['generator']).read_bytes()) == manifest['generatorSha256']
for record in manifest['sources']:
    raw = (SAMPLE / 'SourceAssets/WarcraftIII' / record['path'].replace('\\', '/')).read_bytes()
    assert len(raw) == record['bytes'] and rules.sha(raw) == record['sha256']
for record in manifest['files']:
    raw = (SAMPLE / record['path']).read_bytes()
    assert len(raw) == record['bytes'] and rules.sha(raw) == record['sha256']
catalog = json.loads((SAMPLE / 'wisp-rules.json').read_bytes())
assert {k: catalog[k] for k in ['hp', 'damage', 'armorValue', 'speed', 'gold', 'wood', 'food', 'time', 'nightRegen', 'lumber', 'harvestTime', 'harvestReach']} == dict(hp=120, damage=0, armorValue=0, speed=2.7, gold=60, wood=0, food=1, time=14, nightRegen=0.5, lumber=5, harvestTime=8, harvestReach=1.5)
for name, key in [('UnitBalance', 'ewsp'), ('UnitWeapons', 'ewsp'), ('UnitAbilities', 'ewsp'), ('AbilityData', 'Awha')]:
    assert rules.rows((SAMPLE / f'SourceAssets/WarcraftIII/Units/{name}.slk').read_bytes())[key] == catalog['sourceRows'][name]
with tempfile.TemporaryDirectory(prefix='frost-wisp-rules-') as directory:
    sandbox = pathlib.Path(directory)
    generator = sandbox / manifest['generator']
    generator.parent.mkdir(parents=True)
    generator.write_bytes((ROOT / manifest['generator']).read_bytes())
    for pack, records in [('night-elf-rule-export', manifest['sources'][:3]), ('wisp-ability-export', manifest['sources'][3:])]:
        output = sandbox / 'tmp' / pack
        output.mkdir(parents=True)
        (output / 'manifest.json').write_text(json.dumps(dict(files=records)))
        for record in records:
            relative = record['path'].replace('\\', '/')
            target = output / 'raw' / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((SAMPLE / 'SourceAssets/WarcraftIII' / relative).read_bytes())
    rules.ROOT, rules.SAMPLE = sandbox, sandbox / 'samples/frostbound-realms'
    rules.main()
    for record in manifest['files']:
        assert (rules.SAMPLE / record['path']).read_bytes() == (SAMPLE / record['path']).read_bytes()
    assert (rules.SAMPLE / 'wisp-rule-sources.json').read_bytes() == (SAMPLE / 'wisp-rule-sources.json').read_bytes()
    for pack in ['night-elf-rule-export', 'wisp-ability-export']:
        (sandbox / 'tmp' / pack / 'manifest.json').unlink()
    rules.main()
    assert (rules.SAMPLE / 'wisp-rule-sources.json').read_bytes() == (SAMPLE / 'wisp-rule-sources.json').read_bytes(), 'Regeneration uses retained signed source tables without a game install or temporary exports'
    modified = rules.SAMPLE / 'wisp-rules.json'
    modified.write_bytes(b'artist modification\n')
    before = {str(p): p.read_bytes() for p in rules.SAMPLE.rglob('*') if p.is_file()}
    try:
        rules.main()
        raise RuntimeError('Modified output must be protected')
    except AssertionError as error:
        assert 'Preserve modified Wisp rules' in str(error)
    assert before == {str(p): p.read_bytes() for p in rules.SAMPLE.rglob('*') if p.is_file()}
print('PASS Wisp source hashes, source SLK rows, 7 byte-identical generated files and atomic modified-output protection')

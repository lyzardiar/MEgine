"""Author: MiYu. Verify signed ranked-wolf rules, original meshes and offline asset reproduction."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
PROBE = Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe')


def sha(raw): return hashlib.sha256(raw).hexdigest()


def main():
    packs = [('farseer-art-sources.json', 'scripts/import-frost-farseer-art.py'), ('farseer-particle-sources.json', 'scripts/import-frost-farseer-particles.py'), ('farseer-rules-sources.json', 'scripts/import-frost-farseer-rules.py'), ('farseer-effects-sources.json', 'scripts/import-frost-farseer-effects.py')]
    receipts = {}; verified = set(); guids = 0
    for filename, generator in packs:
        r = json.loads((SAMPLE / filename).read_bytes()); receipts[filename] = r
        assert not r['runtimeIntegrated'] and not r['originalRuntimeVerified']
        dependencies = r.get('dependencies', []); dependencies = dependencies if isinstance(dependencies, list) else []
        for entry in r['outputs'] + [dict(s, path=s['output']) for s in r['sources']] + r.get('inputs', []) + dependencies:
            p = (SAMPLE / entry['path']).resolve(); assert p.is_relative_to(SAMPLE.resolve()); raw = p.read_bytes(); assert len(raw) == entry['bytes'] and sha(raw) == entry['sha256'], p; verified.add(str(p))
        for entry in r['generators']: assert sha((ROOT / entry['path']).read_bytes().replace(b'\r\n', b'\n')) == entry['sha256'], entry
        for entry in r.get('binaries', []):
            p = ROOT / entry['path']; assert p.stat().st_size == entry['bytes'] and sha(p.read_bytes()) == entry['sha256'], p
        for entry in r['outputs']:
            if entry['path'].endswith('.meta'):
                data = json.loads((SAMPLE / entry['path']).read_bytes()); assert data['guid'] == str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + entry['path'][:-5])); guids += 1
    rules = json.loads((SAMPLE / 'farseer-rules.json').read_bytes()); wolves = list(rules['wolves'].values())
    assert [u['id'] for u in wolves] == ['osw1', 'osw2', 'osw3']
    assert [u['hp'] for u in wolves] == [200, 300, 500]
    assert [u['speed'] for u in wolves] == [3.2, 3.5, 3.5]
    assert [u['modelScale'] for u in wolves] == [.9, 1.1, 1.3]
    assert [u['selectionScale'] for u in wolves] == [1.25, 1.5, 1.75]
    assert [u['abilityIds'] for u in wolves] == [[], ['ACct'], ['ACct', 'Apiv']]
    assert len({u['sourceModel'].lower() for u in wolves}) == 1 and all(u['sourceModel'].lower().endswith('spiritwolf') for u in wolves)
    chain = rules['abilities']['AOcl']['levels']; assert [int(l['data']['DataA']) for l in chain] == [85, 125, 180]; assert [int(l['data']['DataB']) for l in chain] == [4, 6, 8]; assert all(float(l['data']['DataC']) == .15 for l in chain)
    models = {**json.loads((SAMPLE / 'farseer-models.json').read_bytes()), **json.loads((SAMPLE / 'farseer-particle-models.json').read_bytes())}; keys = set()
    for key, model in models.items():
        for part in model['parts']:
            for material in {part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()}:
                data = json.loads((SAMPLE / material).read_bytes())
                for name, value in data.items():
                    if 'texture' in name.lower() and isinstance(value, str) and value.startswith('Assets/'): assert (SAMPLE / value).is_file(), value
            for clip, animation in enumerate(model['animations']):
                for frame in [0, animation['frames'] - 1]: keys.add(str((SAMPLE / part['mesh']).resolve()) + f'#pose={clip}:{frame}')
    run = subprocess.run([str(PROBE), '--stdin'], input='\n'.join(sorted(keys)) + '\n', text=True, encoding='utf-8', capture_output=True); assert run.returncode == 0, run.stderr; bounds = [json.loads(line) for line in run.stdout.splitlines()]; assert len(bounds) == len(keys) and all(b['vertices'] > 0 for b in bounds)
    tmp_root = (ROOT / 'tmp').resolve()
    with tempfile.TemporaryDirectory(prefix='farseer-assets-validation-', dir=tmp_root) as folder:
        work = Path(folder).resolve(); assert work.is_relative_to(tmp_root)
        for filename, generator in packs:
            output = work / filename.removesuffix('.json'); run = subprocess.run([sys.executable, str(ROOT / generator), '--source-root', str(SAMPLE), '--output', str(output)], capture_output=True, text=True, encoding='utf-8'); assert run.returncode == 0, run.stderr
            for record in receipts[filename]['outputs']: assert (output / record['path']).read_bytes() == (SAMPLE / record['path']).read_bytes(), record['path']
            assert (output / filename).read_bytes() == (SAMPLE / filename).read_bytes(), filename
            if filename == 'farseer-effects-sources.json':
                effect_file = output / 'Assets/FarseerEffects/Effects/LightningBoltMissile.mfx'; effect_file.write_bytes(effect_file.read_bytes() + b' ')
                rejected = subprocess.run([sys.executable, str(ROOT / generator), '--source-root', str(SAMPLE), '--output', str(output)], capture_output=True, text=True, encoding='utf-8'); assert rejected.returncode != 0 and 'Modified generated output:' in rejected.stderr
        corrupt = work / 'corrupt-dependency'; corrupt.mkdir()
        for filename in ['farseer-effects-sources.json', 'farseer-particle-sources.json', 'farseer-particle-models.json']: (corrupt / filename).write_bytes((SAMPLE / filename).read_bytes())
        (corrupt / 'farseer-particle-models.json').write_bytes((corrupt / 'farseer-particle-models.json').read_bytes() + b' ')
        rejected = subprocess.run([sys.executable, str(ROOT / 'scripts/import-frost-farseer-effects.py'), '--source-root', str(corrupt), '--output', str(work / 'dependency-rejection')], capture_output=True, text=True, encoding='utf-8'); assert rejected.returncode != 0 and 'Particle dependency fingerprint mismatch:' in rejected.stderr
    effect = json.loads((SAMPLE / 'Assets/FarseerEffects/Effects/LightningBoltMissile.mfx').read_bytes()); model_material = next(i for i, m in enumerate(effect['materials']) if m.get('model'))
    counts = {clip['name']: sum(p['material'] == model_material for frame in clip['frames'] for p in frame['particles']) for clip in effect['clips']}
    assert counts['Stand'] == counts['Birth'] == 0 and counts['Death'] > 0, counts
    particles = [p for clip in effect['clips'] for frame in clip['frames'] for p in frame['particles'] if p['material'] == model_material]
    assert all(p['size'] == 1 and p['age'] >= 0 for p in particles)
    assert len(effect['materials'][model_material]['model']['parts']) == 3
    report = dict(author='MiYu', passed=True, hashVerifiedFiles=len(verified), metadataGuids=guids, bodyAndPortraitModels=3, rankedWolfRules=3, effectBindings=10, modelParticleSamples=counts, nativeGeometrySamples=len(keys), offlineByteIdentical=True, modifiedOutputRejected=True, corruptParticleDependencyRejected=True, gameplayIntegrated=False, pending=['Four Far Seer spells, wolf gameplay and TCP integration', 'Original-game solver parity'], scope='Source data and model asset verification. Native GPU preview is a separate check; this is not playable Far Seer acceptance.')
    (ROOT / 'docs/designs/frostbound-realms/farseer-assets-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8'); print('PASS original Far Seer asset preparation:', json.dumps(report))


if __name__ == '__main__': main()

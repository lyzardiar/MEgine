"""Author: MiYu. Verify original Lich effect poses, source hashes and reproducible offline imports."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
PROBE = Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe')
sha = lambda raw: hashlib.sha256(raw).hexdigest()
PACKS = [(f'lich-{name}-sources.json', f'scripts/import-frost-lich-{name}.py') for name in ['rules', 'effects']]


def main():
    receipts = {}; verified = set(); guids = 0
    for filename, _ in PACKS:
        r = json.loads((SAMPLE / filename).read_bytes()); receipts[filename] = r
        assert not r['runtimeIntegrated'] and not r['originalRuntimeVerified']
        for entry in r['outputs'] + [dict(s, path=s['output']) for s in r['sources']] + r.get('inputs', []):
            p = (SAMPLE / entry['path']).resolve(); assert p.is_relative_to(SAMPLE.resolve()); raw = p.read_bytes()
            assert len(raw) == entry['bytes'] and sha(raw) == entry['sha256'], entry['path']; verified.add(str(p))
        for entry in r['generators']: assert sha((ROOT / entry['path']).read_bytes().replace(b'\r\n', b'\n')) == entry['sha256'], entry['path']
        for entry in r.get('binaries', []):
            raw = (ROOT / entry['path']).read_bytes(); assert len(raw) == entry['bytes'] and sha(raw) == entry['sha256'], entry['path']
        for entry in r['outputs']:
            if entry['path'].endswith('.meta'):
                meta = json.loads((SAMPLE / entry['path']).read_bytes()); assert meta['guid'] == str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + entry['path'][:-5])); guids += 1
    rules = json.loads((SAMPLE / 'lich-rules.json').read_bytes()); art = json.loads((SAMPLE / 'lich-effects.json').read_bytes()); geometry = json.loads((SAMPLE / 'lich-effect-models.json').read_bytes())
    assert rules['unit']['commandOrder'] == ['AUfn', 'AUfu', 'AUdr', 'AUdd']
    assert set(art) == {'LichMissile', 'FrostNovaTarget', 'FrostDamage', 'FrostArmorTarget', 'FrostArmorDamage', 'DarkRitualCaster', 'DarkRitualTarget', 'DeathAndDecayTarget', 'DeathAndDecayDamage', 'ClassicLichEmbedded'}
    pure = {'FrostDamage', 'FrostArmorDamage', 'DarkRitualCaster', 'DeathAndDecayTarget', 'DeathAndDecayDamage'}
    assert set(geometry) == set(art) - pure - {'ClassicLichEmbedded'}
    assert rules['abilities']['AUfn']['levels'][0]['areaDamage'] == 50
    assert rules['abilities']['AUfn']['levels'][0]['targetDamage'] == 100
    assert rules['abilities']['AUfu']['levels'][0]['armorDuration'] == 45
    assert rules['abilities']['AUdd']['levels'][0]['buildingReduction'] == 1
    assert rules['effects']['XUdd']['sourceFunc']['Effectsoundlooped'] == 'DeathAndDecayLoop'
    effect_keys = []; expected = []; keys = set()
    for key, effect in art.items():
        data = json.loads((SAMPLE / effect['effect']).read_bytes()); assert len(data['clips']) == len(effect['animations'])
        record = next(r for r in receipts['lich-effects-sources.json']['sources'] if r['path'].lower() == effect['sourceModel'].lower()); assert record['sha256'] == effect['sourceSha256']
        frames = [frame for clip in data['clips'] for frame in clip['frames']]
        counts = dict(clips=len(data['clips']), frames=len(frames), **{name: sum(len(f[name]) for f in frames) for name in ['particles', 'quads', 'lights']})
        assert all(receipts['lich-effects-sources.json']['statistics'][key][name] == value for name, value in counts.items()); effect_keys.append(str((SAMPLE / effect['effect']).resolve())); expected.append(counts)
        for material in data['materials']: assert (SAMPLE / material['texture']).is_file(), material
        if key in pure: assert effect['particleOnly'] and not effect['embedded'] and not effect['parts'] and counts['particles'] + counts['quads'] > 0
    for model in geometry.values():
        for part in model['parts']:
            for material in {part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()}:
                data = json.loads((SAMPLE / material).read_bytes())
                for name, value in data.items():
                    if 'texture' in name.lower() and isinstance(value, str) and value.startswith('Assets/'): assert (SAMPLE / value).is_file(), value
            for clip, animation in enumerate(model['animations']):
                for frame in [0, animation['frames'] - 1]: keys.add(str((SAMPLE / part['animatedMesh']).resolve()) + f'#pose={clip}:{frame}')
    def native(refs):
        run = subprocess.run([str(PROBE), '--stdin'], input='\n'.join(refs) + '\n', text=True, encoding='utf-8', capture_output=True); assert run.returncode == 0, run.stderr
        results = [json.loads(line) for line in run.stdout.splitlines()]; assert len(results) == len(refs); return results
    for actual, counts in zip(native(effect_keys), expected): assert all(actual[name] == value for name, value in counts.items()), actual
    bounds = native(sorted(keys)); assert all(b['vertices'] > 0 for b in bounds)
    with tempfile.TemporaryDirectory(prefix='lich-assets-', dir=ROOT / 'tmp') as folder:
        work = Path(folder)
        def generate(generator, source, output): return subprocess.run([sys.executable, str(ROOT / generator), '--source-root', str(source), '--output', str(output), '--game', str(work / 'absent-game')], capture_output=True)
        for filename, generator in PACKS:
            output = work / filename.removesuffix('.json'); run = generate(generator, SAMPLE, output); assert run.returncode == 0, run.stderr.decode('utf-8', errors='replace')
            for entry in receipts[filename]['outputs']: assert (output / entry['path']).read_bytes() == (SAMPLE / entry['path']).read_bytes(), entry['path']
            assert (output / filename).read_bytes() == (SAMPLE / filename).read_bytes(), filename
            target = output / next(entry['path'] for entry in receipts[filename]['outputs'] if entry['path'].endswith('.json')); target.write_bytes(target.read_bytes() + b' ')
            rejected = generate(generator, SAMPLE, output); assert rejected.returncode != 0 and b'Modified' in rejected.stderr, filename
            sparse = work / ('corrupt-' + filename); sparse.mkdir(); shutil.copyfile(SAMPLE / filename, sparse / filename)
            for entry in receipts[filename]['sources']:
                p = sparse / entry['output']; p.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(SAMPLE / entry['output'], p)
            for entry in receipts[filename].get('dependencies', []) + receipts[filename].get('inputs', []):
                p = sparse / entry['path']; p.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(SAMPLE / entry['path'], p)
            if filename == 'lich-rules-sources.json': shutil.copyfile(SAMPLE / 'undead-hero-sources.json', sparse / 'undead-hero-sources.json')
            target = sparse / receipts[filename]['sources'][0]['output']; target.write_bytes(target.read_bytes() + b'corrupt')
            rejected = generate(generator, sparse, work / ('rejected-' + filename)); assert rejected.returncode != 0 and b'fingerprint mismatch' in rejected.stderr.lower(), (filename, rejected.stderr)
    report = dict(author='MiYu', passed=True, verifiedFiles=len(verified), guids=guids, spellGeometryModels=len(geometry), nativeEffects=len(effect_keys), nativeGeometryPoseSamples=len(keys), pureParticleEffects=sorted(pure), offlineByteIdentical=True, modifiedOutputRejected=True, corruptSourceRejected=True, runtimeGameplayIntegrated=False, originalRuntimeVerified=False, probeSha256=sha(PROBE.read_bytes()), sha256={f: sha((SAMPLE / f).read_bytes()) for f in ['lich-rules.json', 'lich-rules-sources.json', 'lich-effects.json', 'lich-effect-models.json', 'lich-effects-sources.json']}, scope='Original fingerprinted rules/effects, native parsing and poses, offline reproduction; gameplay and GPU rendering require separate acceptance.')
    (ROOT / 'docs/designs/frostbound-realms/lich-assets-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n'); print('PASS Lich fingerprinted assets:', json.dumps({k: report[k] for k in ['verifiedFiles', 'spellGeometryModels', 'nativeEffects', 'nativeGeometryPoseSamples', 'offlineByteIdentical', 'corruptSourceRejected', 'modifiedOutputRejected']}))


if __name__ == '__main__': main()

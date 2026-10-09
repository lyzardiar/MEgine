"""Author: MiYu. Check source provenance, original Tauren geometry and offline byte-identical effects/rules."""
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


def main():
    packs = [('tauren-rules-sources.json', 'scripts/import-frost-tauren-rules.py'), ('tauren-effects-sources.json', 'scripts/import-frost-tauren-effects.py')]
    receipts = {}; verified = set(); guids = 0
    for filename, generator in packs:
        r = json.loads((SAMPLE / filename).read_bytes()); receipts[filename] = r
        assert not r['runtimeIntegrated'] and not r['originalRuntimeVerified']
        for e in r['outputs'] + [dict(s, path=s['output']) for s in r['sources']] + r.get('inputs', []):
            p = (SAMPLE / e['path']).resolve(); assert p.is_relative_to(SAMPLE.resolve()); raw = p.read_bytes()
            assert len(raw) == e['bytes'] and sha(raw) == e['sha256'], p; verified.add(str(p))
        for e in r['generators']: assert sha((ROOT / e['path']).read_bytes().replace(b'\r\n', b'\n')) == e['sha256'], e['path']
        for e in r.get('binaries', []):
            raw = (ROOT / e['path']).read_bytes(); assert len(raw) == e['bytes'] and sha(raw) == e['sha256'], e['path']
        for e in r['outputs']:
            if e['path'].endswith('.meta'):
                meta = json.loads((SAMPLE / e['path']).read_bytes()); assert meta['guid'] == str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + e['path'][:-5])); guids += 1
    art = json.loads((SAMPLE / 'tauren-effects.json').read_bytes()); models = json.loads((SAMPLE / 'tauren-effect-models.json').read_bytes()); keys = set()
    for key, effect in art.items():
        data = json.loads((SAMPLE / effect['effect']).read_bytes()); assert len(data['clips']) == len(effect['animations'])
        record = next(r for r in receipts['tauren-effects-sources.json']['sources'] if r['path'].lower() == effect['sourceModel'].lower())
        assert record['sha256'] == effect['sourceSha256']
        for m in data['materials']: assert (SAMPLE / m['texture']).is_file(), m
        for part in effect['parts']:
            assert (SAMPLE / part['mesh']).is_file() and (SAMPLE / part['material']).is_file()
    for model in models.values():
        for part in model['parts']:
            for material in {part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()}:
                data = json.loads((SAMPLE / material).read_bytes())
                for name, value in data.items():
                    if 'texture' in name.lower() and isinstance(value, str) and value.startswith('Assets/'): assert (SAMPLE / value).is_file(), value
            for clip, animation in enumerate(model['animations']):
                for frame in [0, animation['frames'] - 1]: keys.add(str((SAMPLE / part['mesh']).resolve()) + f'#pose={clip}:{frame}')
    run = subprocess.run([str(PROBE), '--stdin'], input='\n'.join(sorted(keys)) + '\n', text=True, encoding='utf-8', capture_output=True); assert run.returncode == 0, run.stderr
    bounds = [json.loads(line) for line in run.stdout.splitlines()]; assert len(bounds) == len(keys) and all(b['vertices'] > 0 for b in bounds)
    assert set(art) == {'ShockwaveMissile', 'WarStompCaster', 'CommandAura', 'ReincarnationTarget', 'ClassicTaurenChieftainEmbedded'}
    assert receipts['tauren-effects-sources.json']['statistics']['ClassicTaurenChieftainEmbedded']['quads'] > 0
    with tempfile.TemporaryDirectory(prefix='tauren-assets-', dir=ROOT / 'tmp') as folder:
        work = Path(folder)
        for filename, generator in packs:
            command = [sys.executable, str(ROOT / generator), '--source-root', str(SAMPLE), '--output', str(work), '--game', str(work / 'absent-game')]
            run = subprocess.run(command, capture_output=True); assert run.returncode == 0, run.stderr
            for e in receipts[filename]['outputs']: assert (work / e['path']).read_bytes() == (SAMPLE / e['path']).read_bytes(), e['path']
        target = work / art['ShockwaveMissile']['effect']; original = target.read_bytes(); target.write_bytes(original + b'tampered')
        run = subprocess.run([sys.executable, str(ROOT / packs[1][1]), '--source-root', str(SAMPLE), '--output', str(work), '--game', str(work / 'absent-game')], capture_output=True)
        assert run.returncode != 0 and b'Modified generated output' in run.stderr
        sparse = work / 'signed-source'; sparse.mkdir()
        for filename, _ in packs:
            for e in receipts[filename]['sources']:
                p = sparse / e['output']; p.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(SAMPLE / e['output'], p)
            shutil.copyfile(SAMPLE / filename, sparse / filename)
        for p in ['orc-hero-sources.json', 'orc-hero-rules.json']: shutil.copyfile(SAMPLE / p, sparse / p)
        source = sparse / receipts['tauren-effects-sources.json']['sources'][0]['output']; source.write_bytes(source.read_bytes() + b'corrupt')
        run = subprocess.run([sys.executable, str(ROOT / packs[1][1]), '--source-root', str(sparse), '--output', str(work / 'corrupt-output'), '--game', str(work / 'absent-game')], capture_output=True)
        assert run.returncode != 0 and b'fingerprint mismatch' in run.stderr.lower()
    report = dict(author='MiYu', passed=True, signedFiles=len(verified), guids=guids, geometryPoseSamples=len(keys), offlineByteIdentical=True, modifiedOutputRejected=True, corruptSourceRejected=True, runtimeGameplayIntegrated=False, sha256={f:sha((SAMPLE / f).read_bytes()) for f in ['tauren-rules.json','tauren-effects.json','tauren-effect-models.json']})
    (ROOT / 'docs/designs/frostbound-realms/tauren-assets-validation.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8', newline='\n')
    print('PASS Tauren assets:', json.dumps(report))


if __name__ == '__main__': main()

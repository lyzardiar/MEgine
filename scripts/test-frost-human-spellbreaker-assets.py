"""Author: MiYu. Verify original Spell Breaker effects, sidecars and independent reproduction."""
import hashlib
import importlib
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
RECEIPT = 'human-spellbreaker-effects-sources.json'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
independent = importlib.import_module('test-frost-human-sanctum-assets')


def main():
    receipt = json.loads((SAMPLE / RECEIPT).read_bytes())
    outputs = receipt['outputs']; signed = {r['path'] for r in outputs}
    for r in outputs + receipt['sources']:
        raw = (SAMPLE / r.get('output', r['path'])).read_bytes()
        assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], r['path']
    for r in receipt['generators']: assert sha((ROOT / r['path']).read_bytes().replace(b'\r\n', b'\n')) == r['sha256'], r['path']
    for r in receipt['binaries']:
        path = pathlib.Path(r['path']); raw = (path if path.is_absolute() else ROOT / path).read_bytes()
        assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], r['path']
    for name in signed:
        if pathlib.Path(name).suffix in ['.glb', '.mmat', '.mfx', '.png']: assert name + '.meta' in signed, name
        if name.endswith('.glb'): independent.glb((SAMPLE / name).read_bytes())
        if name.endswith('.png.meta'):
            assert json.loads((SAMPLE / name).read_bytes()) == dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + name[:-5])), importer='texture')
    art = json.loads((SAMPLE / 'human-spellbreaker-effects.json').read_bytes())
    assert set(art) == {'SpellBreakerAttack', 'ControlMagicTarget', 'SpellStealMissile', 'SpellStealTarget'}
    assert art['SpellBreakerAttack']['particleOnly'] and not art['SpellBreakerAttack']['parts']
    assert len(art['ControlMagicTarget']['parts']) == 4 and not art['ControlMagicTarget'].get('particleOnly')
    assert len(art['SpellStealMissile']['parts']) == 5 and not art['SpellStealMissile'].get('particleOnly')
    assert art['SpellStealTarget']['particleOnly'] and not art['SpellStealTarget']['parts']
    for name, duration, frames in [('SpellBreakerAttack', 2.1, 27), ('ControlMagicTarget', 2.2, 28)]:
        assert art[name]['animations'] == [dict(name='Birth', frames=frames, duration=duration, loop=False)]
    assert receipt['statistics']['SpellBreakerAttack']['particles'] == 39
    assert art['SpellStealMissile']['animations'] == [dict(name='Birth', frames=10, duration=.667, loop=False), dict(name='Stand', frames=9, duration=.666, loop=True), dict(name='Death', frames=9, duration=.666, loop=False)]
    assert art['SpellStealTarget']['animations'] == [dict(name='Birth', frames=37, duration=2.966, loop=False)]
    for name, stats in [('SpellStealMissile', dict(clips=3, frames=28, particles=105, quads=107, lights=0, sourceParticles=2, sourceRibbons=0)), ('SpellStealTarget', dict(clips=1, frames=37, particles=88, quads=0, lights=0, sourceParticles=1, sourceRibbons=0))]:
        assert receipt['statistics'][name] == stats, name
    assert receipt['nativeGeometryParts'] == 9 and receipt['runtimeIntegrated'] is False and receipt['originalRuntimeVerified'] is False
    with tempfile.TemporaryDirectory(prefix='spellbreaker-reproduce-', dir='D:/MEngineNativeQA') as temp:
        output = pathlib.Path(temp) / 'sample'
        def run(source=SAMPLE, target=output, success=True):
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/import-frost-human-spellbreaker-effects.py'), '--source-root', str(source), '--output', str(target), '--sampler', 'C:/Users/admin/.codex/worktrees/1339/MEgine/tmp/warcraft-effects/sentinel-bin/MdxExport.dll', '--metadata-reader', 'C:/Users/admin/.codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll'], capture_output=True)
            assert (result.returncode == 0) == success, (result.stdout + result.stderr).decode(errors='replace')
            return result
        run()
        for r in outputs: assert (output / r['path']).read_bytes() == (SAMPLE / r['path']).read_bytes(), r['path']
        altered = output / outputs[0]['path']; altered.write_bytes(b'modified')
        assert b'Modified generated output:' in run(success=False).stderr
        corrupt = pathlib.Path(temp) / 'corrupt'; corrupt.mkdir(); shutil.copy2(SAMPLE / RECEIPT, corrupt)
        for r in receipt['sources']:
            target = corrupt / r['output']; target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(SAMPLE / r['output'], target)
        (corrupt / receipt['sources'][0]['output']).write_bytes(b'corrupt')
        assert b'Source fingerprint mismatch:' in run(source=corrupt, target=pathlib.Path(temp) / 'rejected', success=False).stderr
    report = dict(author='MiYu', passed=True, sources=len(receipt['sources']), signedOutputs=len(outputs), reproducedOutputs=len(outputs), materialMetas=sum(name.endswith('.mmat.meta') for name in signed), nativeGeometryParts=9, sampledParticles=sum(r['particles'] for r in receipt['statistics'].values()), spellStealMissileParts=5, spellStealMissileClips=3, spellStealTargetParticleOnly=True, modifiedOutputProtected=True, corruptSourceRejected=True, runtimeIntegrated=False, originalRuntimeVerified=False)
    (ROOT / 'docs/designs/frostbound-realms/human-spellbreaker-assets-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__': main()

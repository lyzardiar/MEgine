"""Author: MiYu. Verify Priest source identity, geometry, signed sidecars and independent reproduction."""
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
sha = lambda raw: hashlib.sha256(raw).hexdigest()
independent = importlib.import_module('test-frost-human-sanctum-assets')


def main():
    receipts = [json.loads((SAMPLE / name).read_bytes()) for name in ['human-priest-sources.json', 'human-priest-effects-sources.json']]
    outputs = [r for receipt in receipts for r in receipt['outputs']]
    for r in outputs:
        raw = (SAMPLE / r['path']).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], r['path']
    for receipt, prefix in zip(receipts, ['SourceAssets/HumanPriest/', 'SourceAssets/HumanPriestEffects/']):
        for r in receipt['sources']:
            raw = (SAMPLE / r.get('output', prefix + r['path'])).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256']
        for r in receipt.get('dependencies', []):
            raw = (SAMPLE / r['path']).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256']
    buff = independent.slk((SAMPLE / 'SourceAssets/HumanPriest/Units/AbilityBuffData.slk').read_bytes())['Binf']
    rules = json.loads((SAMPLE / 'human-priest-spells.json').read_bytes()); assert rules['buffSource'] == buff and rules['buffFunc']['Targetattach'] == 'overhead'
    original = independent.slk((SAMPLE / 'SourceAssets/HumanSanctum/Units/AbilityData.slk').read_bytes())
    assert float(original['Adis']['Cost1']) == 75 and float(original['Adis']['Area1']) == 200 and float(original['Adis']['DataB1']) == 200
    assert float(original['Ainf']['Cost1']) == 35 and float(original['Ainf']['DataA1']) == .1 and float(original['Ainf']['DataB1']) == 5 and float(original['Ainf']['Dur1']) == 60
    for r in receipts[0]['outputs']:
        if not r['path'].endswith('.png.meta'): continue
        icon = r['path'][:-5]; meta = json.loads((SAMPLE / r['path']).read_bytes())
        assert meta == dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + icon)), importer='texture')
    signed = {r['path'] for r in outputs}
    for path in signed:
        if pathlib.Path(path).suffix in ['.glb', '.mmat', '.mfx', '.png']: assert path + '.meta' in signed, path
        if path.endswith('.glb'): independent.glb((SAMPLE / path).read_bytes())
    effects = json.loads((SAMPLE / 'human-priest-effects.json').read_bytes())
    assert all(len(effects[k]['parts']) == 6 for k in ['DispelMagicTarget', 'InnerFireTarget'])
    birth = next(a for a in effects['DispelMagicTarget']['animations'] if a['name'] == 'Birth'); assert birth['duration'] == 2.067 and not birth['loop']
    assert {a['name'] for a in effects['InnerFireTarget']['animations']} == {'Birth', 'Stand', 'Death'}
    with tempfile.TemporaryDirectory(prefix='priest-reproduce-', dir='D:/MEngineNativeQA') as temp:
        output = pathlib.Path(temp) / 'sample'
        def run(script, extra=(), success=True, source=SAMPLE, target=output):
            r = subprocess.run([sys.executable, str(ROOT / 'scripts' / script), '--source-root', str(source), '--output', str(target), *extra], capture_output=True)
            assert (r.returncode == 0) == success, (r.stdout + r.stderr).decode(errors='replace')
            return r
        run('import-frost-human-priest.py')
        run('import-frost-human-priest-effects.py', ['--sampler', 'C:/Users/admin/.codex/worktrees/1339/MEgine/tmp/warcraft-effects/sentinel-bin/MdxExport.dll', '--metadata-reader', 'C:/Users/admin/.codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll'])
        for r in outputs: assert (output / r['path']).read_bytes() == (SAMPLE / r['path']).read_bytes(), r['path']
        meta = receipts[0]['outputs'][0]['path']; (output / meta).write_bytes(b'modified'); assert b'Modified signed Priest output' in run('import-frost-human-priest.py', success=False).stderr
        (output / meta).write_bytes((SAMPLE / meta).read_bytes()); (output / 'human-priest-sources.json').unlink(); assert b'Unsigned Priest output exists' in run('import-frost-human-priest.py', success=False).stderr
        corrupt = pathlib.Path(temp) / 'corrupt'; corrupt.mkdir(); shutil.copy2(SAMPLE / 'human-priest-sources.json', corrupt); (corrupt / 'human-sanctum.json').write_bytes((SAMPLE / 'human-sanctum.json').read_bytes() + b' ')
        assert b'Corrupt Priest dependency' in run('import-frost-human-priest.py', success=False, source=corrupt, target=pathlib.Path(temp) / 'rejected').stderr
        shutil.copy2(SAMPLE / 'human-sanctum.json', corrupt)
        for r in receipts[0]['dependencies']:
            target = corrupt / r['path']; target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(SAMPLE / r['path'], target)
        source = corrupt / 'SourceAssets/HumanPriest/Units/AbilityBuffData.slk'; source.parent.mkdir(parents=True); source.write_bytes(b'corrupt')
        assert b'Corrupt Priest source' in run('import-frost-human-priest.py', success=False, source=corrupt, target=pathlib.Path(temp) / 'rejected').stderr
    report = dict(author='MiYu', passed=True, signedFiles=len(outputs), sources=sum(len(r['sources']) for r in receipts), reproducedOutputs=len(outputs), signedTextureMetas=5, geometryParts=12, modifiedOutputProtected=True, unsignedOutputProtected=True, corruptDependencyRejected=True, corruptSourceRejected=True, originalRuntimeVerified=False)
    (ROOT / 'docs/designs/frostbound-realms/human-priest-assets-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__': main()

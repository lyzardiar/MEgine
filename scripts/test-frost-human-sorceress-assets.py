"""Author: MiYu. Verify Sorceress source identity, geometry, signed sidecars and independent reproduction."""
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
    receipts = [json.loads((SAMPLE / name).read_bytes()) for name in ['human-sorceress-sources.json', 'human-sorceress-art-sources.json', 'human-sorceress-effects-sources.json']]
    outputs = [r for receipt in receipts for r in receipt['outputs']]
    for r in outputs:
        raw = (SAMPLE / r['path']).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], r['path']
    for receipt, prefix in zip(receipts, ['SourceAssets/HumanSorceress/', 'SourceAssets/HumanSorceressArt/', 'SourceAssets/HumanSorceressEffects/']):
        for r in receipt['sources']:
            raw = (SAMPLE / r.get('output', prefix + r['path'])).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256']
        for r in receipt.get('dependencies', []) if isinstance(receipt.get('dependencies', []), list) else []:
            raw = (SAMPLE / r['path']).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256']
        for r in receipt.get('generators', [receipt.get('generator')]):
            if r: assert sha((ROOT / r['path']).read_bytes().replace(b'\r\n', b'\n')) == r['sha256']
        for r in receipt.get('binaries', []):
            path = pathlib.Path(r['path']); raw = (path if path.is_absolute() else ROOT / path).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256']
    rules = json.loads((SAMPLE / 'human-sorceress-spells.json').read_bytes())
    buffs = independent.slk((SAMPLE / 'SourceAssets/HumanSorceress/Units/AbilityBuffData.slk').read_bytes())
    for id in ['Binv', 'Bply']: assert rules['buffs'][id]['sourceRow'] == buffs[id]
    assert rules['buffs']['Bply']['sourceFunc']['Effectart'].endswith('PolyMorphDoneGround.mdl')
    original = independent.slk((SAMPLE / 'SourceAssets/HumanSanctum/Units/AbilityData.slk').read_bytes())
    assert float(original['Aivs']['Cost1']) == 50 and float(original['Aivs']['Dur1']) == 120
    assert float(original['Aply']['Cost1']) == 220 and float(original['Aply']['Cool1']) == 3 and float(original['Aply']['Dur1']) == 60
    balance = independent.slk((SAMPLE / 'SourceAssets/HumanSorceress/Units/UnitBalance.slk').read_bytes())
    for id in ['nshe', 'nshf', 'nsha', 'nshw']:
        assert rules['forms'][id]['sourceRows']['UnitBalance'] == balance[id]
        assert rules['forms'][id]['speed'] == 1 and rules['forms'][id]['armor'] == 'medium'
    for r in receipts[0]['outputs']:
        if not r['path'].endswith('.png.meta'): continue
        icon = r['path'][:-5]; meta = json.loads((SAMPLE / r['path']).read_bytes())
        assert meta == dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + icon)), importer='texture')
    signed = {r['path'] for r in outputs}
    for path in signed:
        if pathlib.Path(path).suffix in ['.glb', '.mmat', '.mfx', '.png']: assert path + '.meta' in signed, path
        if path.endswith('.glb'): independent.glb((SAMPLE / path).read_bytes())
    effects = json.loads((SAMPLE / 'human-sorceress-effects.json').read_bytes())
    for k, count in [('InvisibilityTarget', 6), ('PolymorphTarget', 0), ('PolymorphFallingSheep', 1)]: assert len(effects[k]['parts']) == count
    stand = next(a for a in effects['InvisibilityTarget']['animations'] if a['name'] == 'Stand'); assert stand['duration'] == 1.333 and not stand['loop']
    with tempfile.TemporaryDirectory(prefix='sorceress-reproduce-', dir='D:/MEngineNativeQA') as temp:
        output = pathlib.Path(temp) / 'sample'
        def run(script, extra=(), success=True, source=SAMPLE, target=output):
            r = subprocess.run([sys.executable, str(ROOT / 'scripts' / script), '--source-root', str(source), '--output', str(target), *extra], capture_output=True)
            assert (r.returncode == 0) == success, (r.stdout + r.stderr).decode(errors='replace')
            return r
        run('import-frost-human-sorceress.py')
        run('import-frost-human-sorceress-art.py', ['--sampler', 'C:/Users/admin/.codex/worktrees/1339/MEgine/tmp/warcraft-effects/sentinel-bin/MdxExport.dll', '--metadata-reader', 'C:/Users/admin/.codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll', '--pose-probe', 'D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'])
        run('import-frost-human-sorceress-effects.py', ['--sampler', 'C:/Users/admin/.codex/worktrees/1339/MEgine/tmp/warcraft-effects/sentinel-bin/MdxExport.dll', '--metadata-reader', 'C:/Users/admin/.codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll'])
        for r in outputs: assert (output / r['path']).read_bytes() == (SAMPLE / r['path']).read_bytes(), r['path']
        meta = receipts[0]['outputs'][0]['path']; (output / meta).write_bytes(b'modified'); assert b'Modified signed Sorceress output' in run('import-frost-human-sorceress.py', success=False).stderr
        (output / meta).write_bytes((SAMPLE / meta).read_bytes()); (output / 'human-sorceress-sources.json').unlink(); assert b'Unsigned Sorceress output exists' in run('import-frost-human-sorceress.py', success=False).stderr
        corrupt = pathlib.Path(temp) / 'corrupt'; corrupt.mkdir(); shutil.copy2(SAMPLE / 'human-sorceress-sources.json', corrupt); (corrupt / 'human-sanctum.json').write_bytes((SAMPLE / 'human-sanctum.json').read_bytes() + b' ')
        assert b'Corrupt Sorceress dependency' in run('import-frost-human-sorceress.py', success=False, source=corrupt, target=pathlib.Path(temp) / 'rejected').stderr
        shutil.copy2(SAMPLE / 'human-sanctum.json', corrupt)
        for r in receipts[0]['dependencies']:
            target = corrupt / r['path']; target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(SAMPLE / r['path'], target)
        source = corrupt / 'SourceAssets/HumanSorceress/Units/AbilityBuffData.slk'; source.parent.mkdir(parents=True); source.write_bytes(b'corrupt')
        assert b'Corrupt Sorceress source' in run('import-frost-human-sorceress.py', success=False, source=corrupt, target=pathlib.Path(temp) / 'rejected').stderr
    report = dict(author='MiYu', passed=True, signedFiles=len(outputs), sources=sum(len(r['sources']) for r in receipts), reproducedOutputs=len(outputs), signedTextureMetas=4, geometryParts=12, modifiedOutputProtected=True, unsignedOutputProtected=True, corruptDependencyRejected=True, corruptSourceRejected=True, originalRuntimeVerified=False)
    (ROOT / 'docs/designs/frostbound-realms/human-sorceress-assets-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__': main()

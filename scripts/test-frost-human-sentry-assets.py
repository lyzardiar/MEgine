"""Author: MiYu. Verify retained Sentry sources, deterministic sidecars and independent regeneration."""
import hashlib
import importlib
import io
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import uuid
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
independent = importlib.import_module('test-frost-human-sanctum-assets')


def main():
    receipts = [json.loads((SAMPLE / name).read_bytes()) for name in ['human-sentry-sources.json', 'human-sentry-effects-sources.json']]
    outputs = [r for receipt in receipts for r in receipt['outputs']]
    for r in outputs:
        raw = (SAMPLE / r['path']).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], r['path']
    for receipt, prefix in zip(receipts, ['SourceAssets/HumanSentry/', 'SourceAssets/HumanSentryEffects/']):
        for r in receipt['sources']:
            raw = (SAMPLE / r.get('output', prefix + r['path'])).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256']
    src = SAMPLE / 'SourceAssets/HumanSentry'
    ability = independent.slk((src / 'Units/AbilityData.slk').read_bytes())['Adts']
    enum = independent.ini((src / 'UI/UnitEditorData.txt').read_bytes())['detectionType']
    assert enum['03'] == '3,WESTRING_UE_DETECTIONTYPE_BOTH' and float(ability['DataA1']) == 3 and float(ability['Rng1']) == 900
    units = independent.slk((src / 'Units/UnitAbilities.slk').read_bytes())
    assert all('Adts' in units[k]['abilList'].split(',') for k in ['hwtw', 'hgtw', 'hatw', 'hctw'])
    assert all('Adts' not in units[k]['abilList'].split(',') for k in ['hars', 'htow', 'hkee', 'hcas'])
    icon = 'Assets/Art/classic-human-sentry.png'; meta = json.loads((SAMPLE / (icon + '.meta')).read_bytes())
    assert meta == dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + icon)), importer='texture')
    original = Image.open(io.BytesIO((src / 'ReplaceableTextures/PassiveButtons/PASBTNMagicalSentry.blp').read_bytes())).convert('RGBA')
    converted = Image.open(SAMPLE / icon).convert('RGBA'); assert original.size == converted.size and original.tobytes() == converted.tobytes()
    signed = {r['path'] for r in outputs}
    for path in signed:
        if pathlib.Path(path).suffix in ['.glb', '.mmat', '.mfx', '.png']: assert path + '.meta' in signed, path
        if path.endswith('.glb'): independent.glb((SAMPLE / path).read_bytes())
    effects = json.loads((SAMPLE / 'human-sentry-effects.json').read_bytes())['MagicSentryCaster']
    assert len(effects['parts']) == 3 and {a['name'] for a in effects['animations']} == {'Birth', 'Stand', 'Death'}
    with tempfile.TemporaryDirectory(prefix='sentry-reproduce-', dir='D:/MEngineNativeQA') as temp:
        output = pathlib.Path(temp) / 'sample'
        def run(script, extra=(), success=True):
            r = subprocess.run([sys.executable, str(ROOT / 'scripts' / script), '--source-root', str(SAMPLE), '--output', str(output), *extra], capture_output=True)
            assert (r.returncode == 0) == success, (r.stdout + r.stderr).decode(errors='replace')
            return r
        run('import-frost-human-sentry.py')
        run('import-frost-human-sentry-effects.py', ['--sampler', 'C:/Users/admin/.codex/worktrees/1339/MEgine/tmp/warcraft-effects/sentinel-bin/MdxExport.dll', '--metadata-reader', 'C:/Users/admin/.codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll'])
        for r in outputs: assert (output / r['path']).read_bytes() == (SAMPLE / r['path']).read_bytes(), r['path']
        (output / icon).write_bytes(b'modified'); assert b'Modified signed sentry output' in run('import-frost-human-sentry.py', success=False).stderr
        (output / icon).write_bytes((SAMPLE / icon).read_bytes())
        (output / 'human-sentry-sources.json').unlink(); assert b'Unsigned sentry output exists' in run('import-frost-human-sentry.py', success=False).stderr
        # Copy only the rule sources to test the dependency fingerprint without touching the product.
        corrupt = pathlib.Path(temp) / 'corrupt'; shutil.copytree(src, corrupt / 'SourceAssets/HumanSentry'); shutil.copy2(SAMPLE / 'human-sentry-sources.json', corrupt); (corrupt / 'building-scale-catalog.json').write_bytes((SAMPLE / 'building-scale-catalog.json').read_bytes() + b' ')
        r = subprocess.run([sys.executable, str(ROOT / 'scripts/import-frost-human-sentry.py'), '--source-root', str(corrupt), '--output', str(pathlib.Path(temp) / 'rejected')], capture_output=True)
        assert r.returncode != 0 and b'Corrupt sentry dependency' in r.stderr
    report = dict(author='MiYu', passed=True, signedFiles=len(outputs), sources=sum(len(r['sources']) for r in receipts), reproducedOutputs=len(outputs), textureMetaSigned=True, originalIconPixelsEqual=True, geometryParts=3, modifiedOutputProtected=True, unsignedOutputProtected=True, corruptDependencyRejected=True, originalRuntimeVerified=False)
    (ROOT / 'docs/designs/frostbound-realms/human-sentry-assets-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__': main()

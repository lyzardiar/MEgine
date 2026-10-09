"""Author: MiYu. Verify original effect fingerprints, native loading and offline reproducibility."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
RECEIPT = 'blademaster-effects-sources.json'
PROBE = Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe')


def digest(raw): return hashlib.sha256(raw).hexdigest()


def main():
    receipt = json.loads((SAMPLE / RECEIPT).read_bytes()); verified = 0
    for entry in receipt['outputs'] + [dict(r, path=r['output']) for r in receipt['sources']]:
        p = (SAMPLE / entry['path']).resolve(); assert p.is_relative_to(SAMPLE.resolve())
        raw = p.read_bytes(); assert len(raw) == entry['bytes'] and digest(raw) == entry['sha256'], p; verified += 1
    for entry in receipt['generators']:
        assert digest((ROOT / entry['path']).read_bytes().replace(b'\r\n', b'\n')) == entry['sha256'], entry
    for entry in receipt['binaries']:
        p = ROOT / entry['path']; assert p.stat().st_size == entry['bytes'] and digest(p.read_bytes()) == entry['sha256'], p
    art = json.loads((SAMPLE / 'blademaster-effects.json').read_bytes()); effect_keys = []; expected = []; geometry = []; metadata = 0
    for name, asset in art.items():
        data = json.loads((SAMPLE / asset['effect']).read_bytes()); frames = [f for clip in data['clips'] for f in clip['frames']]
        counts = dict(clips=len(data['clips']), frames=len(frames), **{k: sum(len(f[k]) for f in frames) for k in ['particles', 'quads', 'lights']})
        assert all(receipt['statistics'][name][k] == v for k, v in counts.items()), name
        assert asset['clip'] == 0; effect_keys.append(str((SAMPLE / asset['effect']).resolve())); expected.append(counts)
        for m in data['materials']: assert (SAMPLE / m['texture']).is_file(), m
        for part in asset['parts']:
            materials = [part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()]
            for material in materials:
                data = json.loads((SAMPLE / material).read_bytes())
                for k, value in data.items():
                    if 'texture' in k.lower() and isinstance(value, str) and value.startswith('Assets/'): assert (SAMPLE / value).is_file(), value
            for clip, animation in enumerate(asset['animations']):
                geometry.extend(str((SAMPLE / part['mesh']).resolve()) + f'#pose={clip}:{frame}' for frame in [0, animation['frames'] - 1, animation['frames'] + 3])
    for entry in receipt['outputs']:
        if entry['path'].endswith('.meta'):
            meta = json.loads((SAMPLE / entry['path']).read_bytes()); target = entry['path'][:-5]
            assert meta['guid'] == str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + target)), target; metadata += 1
    def native(keys):
        run = subprocess.run([str(PROBE), '--stdin'], input='\n'.join(keys) + '\n', capture_output=True, text=True, encoding='utf-8'); assert run.returncode == 0, run.stderr
        results = [json.loads(line) for line in run.stdout.splitlines()]; assert len(results) == len(keys); return results
    for actual, counts in zip(native(effect_keys), expected): assert all(actual[k] == v for k, v in counts.items()), actual
    bounds = native(geometry); assert all(b['vertices'] > 0 for b in bounds)
    for i in range(0, len(bounds), 3): assert bounds[i + 1]['min'] == bounds[i + 2]['min'] and bounds[i + 1]['max'] == bounds[i + 2]['max']
    tmp_root = (ROOT / 'tmp').resolve()
    with tempfile.TemporaryDirectory(prefix='blademaster-effects-validation-', dir=tmp_root) as folder:
        work = Path(folder).resolve(); assert work.is_relative_to(tmp_root); output = work / 'rebuild'
        def generate(source, target): return subprocess.run([sys.executable, str(ROOT / 'scripts/import-frost-blademaster-effects.py'), '--source-root', str(source), '--output', str(target)], capture_output=True, text=True, encoding='utf-8')
        run = generate(SAMPLE, output); assert run.returncode == 0, run.stderr
        for entry in receipt['outputs']: assert (output / entry['path']).read_bytes() == (SAMPLE / entry['path']).read_bytes(), entry['path']
        assert (output / RECEIPT).read_bytes() == (SAMPLE / RECEIPT).read_bytes()
        modified = output / 'blademaster-effects.json'; modified.write_bytes(modified.read_bytes() + b' ')
        run = generate(SAMPLE, output); assert run.returncode != 0 and 'Modified generated output' in run.stderr
        corrupt = work / 'corrupt'; corrupt.mkdir(); (corrupt / RECEIPT).write_bytes((SAMPLE / RECEIPT).read_bytes())
        for entry in receipt['sources']:
            p = corrupt / entry['output']; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes((SAMPLE / entry['output']).read_bytes())
        p = corrupt / receipt['sources'][0]['output']; p.write_bytes(p.read_bytes() + b' ')
        run = generate(corrupt, work / 'rejected'); assert run.returncode != 0 and 'Source fingerprint mismatch' in run.stderr
    report = dict(author='MiYu', passed=True, hashVerifiedFiles=verified, metadataGuids=metadata, nativeEffects=len(effect_keys), nativeGeometrySamples=len(geometry), offlineByteIdentical=True, modifiedOutputRejected=True, corruptSourceRejected=True, probeSha256=digest(PROBE.read_bytes()), scope='Native effect parsing and geometry poses, fingerprints and offline generation; GPU rendering is verified separately.')
    (ROOT / 'docs/designs/frostbound-realms/blademaster-effects-conversion-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8'); print('PASS Blademaster effect conversion:', json.dumps(report))


if __name__ == '__main__': main()

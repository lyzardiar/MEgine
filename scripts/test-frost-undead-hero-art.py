"""Author: MiYu. Verify original Undead geometry, material states, cameras and protected offline regeneration."""
import hashlib
import importlib
import json
import math
import pathlib
import shutil
import subprocess
import sys
import tempfile
import uuid
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
nodes = importlib.import_module('convert-frost-classic-billboards')
camera = importlib.import_module('import-frost-demon-hunter').portrait
importer = importlib.import_module('import-frost-orc-hero-art')
RECEIPT = 'undead-hero-art-sources.json'
SOURCE_PREFIX = 'SourceAssets/UndeadHeroes/art/'


def read(path): return json.loads(path.read_bytes())
def sha(raw): return hashlib.sha256(raw).hexdigest()


def main():
    receipt = read(SAMPLE / RECEIPT); models = read(SAMPLE / 'undead-hero-models.json'); views = read(SAMPLE / 'undead-hero-portraits.json')
    assert len(models) == 8 and len(views) == 4
    signed = {r['path']: r for r in receipt['outputs']}; sources = {r['path'].lower(): r for r in receipt['sources']}
    guids = set()
    for record in receipt['outputs']:
        raw = (SAMPLE / record['path']).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
        if record['path'].endswith('.png'):
            with Image.open(SAMPLE / record['path']) as image:
                image.load(); assert image.mode == 'RGBA' and image.width > 0 and image.height > 0
        if record['path'].endswith('.meta'):
            sidecar = json.loads(raw); expected = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + record['path'][:-5]))
            assert sidecar['guid'] == expected and expected not in guids; guids.add(expected)
    for record in receipt['sources']:
        raw = (SAMPLE / record['output']).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
    assert receipt['generatorHashMode'] == 'lf-text'
    for record in receipt['generators']:
        assert sha((ROOT / record['path']).read_bytes().replace(b'\r\n', b'\n')) == record['sha256'], record['path']
    for record in receipt['binaries']:
        assert sha((ROOT / record['path']).read_bytes()) == record['sha256'], record['path']
    assert not receipt['runtimeIntegrated'] and not receipt['originalRuntimeVerified']
    native_refs, requests, part_count, billboard_count = [], {}, 0, 0
    for binding in receipt['bindings']:
        key = binding['key']; model = models[key]; source = sources[binding['path'].lower()]
        metadata = read(SAMPLE / (SOURCE_PREFIX + 'nodes/' + key + '.json'))
        assert model['unit'] == binding['unit'] and nodes.key(model['sourceModel']) == binding['path'].lower()
        tracks = read(SAMPLE / model['sourceStateTracks'])
        assert [c['name'] for c in tracks['clips']] == [c['name'] for c in model['animations']] == [c['name'] for c in metadata['sequences']]
        assert all(math.isfinite(v) and v > 0 for v in model['size'])
        visible_state = tracks['clips'][model['boundsClip']]['frames'][model['boundsFrame']]
        assert any(visible_state['geosets'][p['geoset']]['alpha'] * visible_state['materials'][p['materialIndex']][p['layer']]['alpha'] > .001 for p in model['parts'])
        for part in model['parts']:
            part_count += 1; raw = (SAMPLE / part['mesh']).read_bytes(); doc, _ = nodes.read_glb(raw)
            assert part['mesh'] == part['animatedMesh'] and len(doc['skins']) == 1
            assert [a['name'] for a in doc['animations']] == [c['name'] for c in model['animations']]
            if metadata.get('attachments'):
                assert len(doc['nodes']) == len(metadata['nodes']) + 1
                mapped = {n['extras']['mengineSourceNode']['index']: i for i, n in enumerate(doc['nodes'][:-1])}
                assert set(mapped) == set(range(len(metadata['nodes'])))
                tracks_by_node = {t['node']: t for t in doc['extras']['mengineMdxAnimation']['nodes']}
                for definition in metadata['attachments']:
                    assert tracks_by_node[mapped[definition['sourceNode']]]['attachment'] == {f: definition[f] for f in ['id', 'path', 'visibility']}
                for source_node in metadata['nodes']:
                    actual = doc['nodes'][mapped[source_node['index']]]
                    assert actual['name'] == source_node['name'] and actual['extras']['mengineSourceNode']['objectId'] == source_node['objectId']
                    assert actual.get('children', []) == [mapped[n['index']] for n in metadata['nodes'] if n['parent'] == source_node['index']]
                billboard_count += sum('mengineBillboard' in n.get('extras', {}) for n in doc['nodes'])
            else:
                reannotated, billboards = nodes.annotate(raw, metadata, part['geoset']); assert reannotated == raw
                billboard_count += len(billboards)
            assert len(part['states']) == len(model['animations'])
            for ci, clip in enumerate(tracks['clips']):
                assert model['animations'][ci]['frames'] == len(clip['frames']) - 1
                runs = part['states'][ci]; assert runs and runs[0][0] == 0
                assert all(runs[i][0] < runs[i + 1][0] for i in range(len(runs) - 1))
                ri = 0
                for fi, state in enumerate(clip['frames']):
                    if ri + 1 < len(runs) and runs[ri + 1][0] == fi: ri += 1
                    geo = state['geosets'][part['geoset']]; layer = state['materials'][part['materialIndex']][part['layer']]
                    assert runs[ri][1:] == [*geo['color'], geo['alpha'] * layer['alpha'], layer['texture']]
                for frame in sorted({0, model['animations'][ci]['frames'] // 2, model['animations'][ci]['frames']}):
                    reference = str(SAMPLE / part['mesh']) + f'#pose={ci}:{frame}'
                    if reference not in requests: native_refs.append(reference); requests[reference] = key
            for path in {part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()}:
                assert path in signed; material = read(SAMPLE / path)
                assert material['base_color_texture'] in signed
            if part['replaceableId'] in [1, 2]:
                assert set(part['teamMaterials']) == {'0', '1'}
                red, blue = [read(SAMPLE / part['teamMaterials'][str(team)])['base_color_texture'] for team in [0, 1]]
                assert (SAMPLE / red).read_bytes() != (SAMPLE / blue).read_bytes()
        if binding['portrait']:
            view = views[key]; converted = camera((SAMPLE / source['output']).read_bytes()); converted.pop('cameraSampleFrame')
            for field, value in converted.items(): assert view[field] == value
            assert view['sourceFirstKeyTimes'] == {t['kind']: t['keys'][0]['frame'] for t in converted['sourceCameraTracks']}
            assert view['framing'] == 'fixedSourceFirstKeys' and not view['dynamicCameraIntegrated']
    clips = sum(len(m['animations']) for m in models.values()); assert part_count == 54 and clips == 55
    assert billboard_count > 0
    assert views['ClassicDeathKnightPortrait']['sourceFirstKeyTimes']['KTTR'] == 260000
    assert views['ClassicCryptLordPortrait']['sourceFirstKeyTimes']['KTTR'] == 0
    result = subprocess.check_output(['D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe', '--stdin'], input=('\n'.join(native_refs) + '\n').encode())
    boxes = [json.loads(line) for line in result.splitlines()]; assert len(boxes) == len(native_refs)
    for reference, box in zip(native_refs, boxes):
        assert box['mesh'] == reference and box['vertices'] > 0
        assert all(math.isfinite(v) and abs(v) < 100 for v in box['min'] + box['max'])
        assert all(a <= b for a, b in zip(box['min'], box['max']))
    with tempfile.TemporaryDirectory(prefix='undead-art-validation-', dir=ROOT / 'tmp') as temp:
        work = pathlib.Path(temp); output = work / 'repro'
        command = [sys.executable, str(ROOT / 'scripts/import-frost-undead-hero-art.py'), '--source-root', str(SAMPLE), '--output', str(output), '--game', str(work / 'missing-game')]
        run = subprocess.run(command, capture_output=True, text=True); assert run.returncode == 0, run.stderr
        for record in receipt['outputs']: assert (output / record['path']).read_bytes() == (SAMPLE / record['path']).read_bytes(), record['path']
        assert (output / RECEIPT).read_bytes() == (SAMPLE / RECEIPT).read_bytes()
        victim = output / models['ClassicDeathKnight']['parts'][0]['mesh']; victim.write_bytes(victim.read_bytes() + b'local change')
        before = {p.relative_to(output).as_posix(): sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
        run = subprocess.run(command, capture_output=True, text=True)
        assert run.returncode != 0 and 'Modified generated output' in run.stderr and 'Converting' not in run.stdout
        assert before == {p.relative_to(output).as_posix(): sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
        bad_source = work / 'bad-source'; bad_source.mkdir(); shutil.copyfile(SAMPLE / RECEIPT, bad_source / RECEIPT)
        for record in receipt['sources']:
            target = bad_source / record['output']; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes((SAMPLE / record['output']).read_bytes())
        victim = bad_source / receipt['sources'][0]['output']; victim.write_bytes(victim.read_bytes() + b'bad source')
        rejected = work / 'rejected'
        run = subprocess.run([sys.executable, str(ROOT / 'scripts/import-frost-undead-hero-art.py'), '--source-root', str(bad_source), '--output', str(rejected)], capture_output=True, text=True)
        assert run.returncode != 0 and 'Source fingerprint mismatch' in run.stderr and not rejected.exists()
    report = dict(author='MiYu', passed=True, modelCount=len(models), clips=clips, renderParts=part_count, sourceCount=len(sources), outputCount=len(signed), nativePoses=len(boxes), billboardAnnotations=billboard_count, offlineByteIdentical=True, modifiedOutputProtected=True, damagedSourceRejected=True, runtimeIntegrated=False, originalRuntimeVerified=False)
    target = ROOT / 'docs/designs/frostbound-realms/undead-hero-art-validation.json'; target.write_bytes(nodes.encode(report))
    print(json.dumps(report))


if __name__ == '__main__': main()

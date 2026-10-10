"""Author: MiYu. Verify all source locators and preserve Crypt Lord geometry while extending source nodes."""
import hashlib
import importlib
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
BASELINE = '6fcfc368ad1a379ad0dedaab7d5cf8c206962b21'
PROBE = 'D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'
glb = importlib.import_module('convert-frost-classic-billboards').read_glb
model = json.loads((SAMPLE / 'undead-hero-models.json').read_bytes())['ClassicCryptLord']
metadata = json.loads((SAMPLE / 'SourceAssets/UndeadHeroes/art/nodes/ClassicCryptLord.json').read_bytes())
assert len(metadata['nodes']) == 139 and len(metadata['attachments']) == 15
checks, references = [], []
with tempfile.TemporaryDirectory(prefix='crypt-lord-anchor-check-', dir=ROOT / 'tmp') as folder:
    work = Path(folder)
    for i, part in enumerate(model['parts']):
        path = 'samples/frostbound-realms/' + part['mesh']
        before = subprocess.check_output(['git', 'show', BASELINE + ':' + path], cwd=ROOT)
        after = (SAMPLE / part['mesh']).read_bytes()
        old, old_binary = glb(before); new, new_binary = glb(after)
        assert old_binary == new_binary and old['skins'] == new['skins'] and old['meshes'] == new['meshes']
        assert len(new['nodes']) == 140
        mapped = {n['extras']['mengineSourceNode']['index']: j for j, n in enumerate(new['nodes'][:-1])}
        tracks = {t['node']: t for t in new['extras']['mengineMdxAnimation']['nodes']}
        for a in metadata['attachments']:
            assert tracks[mapped[a['sourceNode']]]['attachment'] == {k: a[k] for k in ['id', 'path', 'visibility']}
        baseline = work / (str(i) + '.glb'); baseline.write_bytes(before)
        for clip, animation in enumerate(model['animations']):
            for frame in sorted({0, animation['frames'] // 2, animation['frames']}):
                references += [str(baseline) + f'#pose={clip}:{frame}', str(SAMPLE / part['mesh']) + f'#pose={clip}:{frame}']
        checks.append(dict(mesh=part['mesh'],binarySha256=hashlib.sha256(new_binary).hexdigest(),geometryAndSkinPreserved=True))
    run = subprocess.run([PROBE, '--stdin'], input='\n'.join(references)+'\n', text=True, encoding='utf-8', capture_output=True, check=True)
    boxes = [json.loads(line) for line in run.stdout.splitlines()]; assert len(boxes) == len(references)
    maximum = 0
    for before, after in zip(boxes[::2], boxes[1::2]):
        assert before['vertices'] == after['vertices']
        maximum = max(maximum, *(abs(a-b) for key in ['min', 'max'] for a,b in zip(before[key], after[key])))
    assert maximum < 1e-5, maximum
    samples = []
    for clip in [0, 2, 8, 11, 14]:
        for frame in [0, 10, 29]:
            result = json.loads(subprocess.check_output([PROBE, '--nodes', str(SAMPLE / model['parts'][0]['mesh']) + f'#pose={clip}:{frame}@30']))
            locators = [n for n in result['nodes'] if n['attachment']]
            assert len(result['nodes']) == 140 and len(locators) == 15
            for name in ['Chest Left Ref', 'Chest Right Ref', 'Chest Mount Left Ref', 'Chest Mount Right Ref', 'OverHead Ref']:
                assert any(n['name'].strip() == name for n in locators), name
            samples.append(dict(clip=clip,frame=frame,nodes=140,locators=15))
report = dict(author='MiYu',passed=True,baselineCommit=BASELINE,parts=checks,pairedNativeGeometryPoses=len(boxes)//2,maxNativeBoundsDifference=maximum,nativeLocatorPoses=samples,sourceNodes=139,sourceLocators=15,scope='Original geometry/skin buffers and native bounds preserved; complete original locator hierarchy, tracks and visibility available. Rendered attachment behavior is validated separately.')
(ROOT / 'docs/designs/frostbound-realms/crypt-lord-anchor-validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8',newline='\n')
print('PASS source Crypt Lord anchors: eight unchanged geometry/skin buffers,',len(boxes)//2,'paired native poses, fifteen locator poses and original hierarchy')

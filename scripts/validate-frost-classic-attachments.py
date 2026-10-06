"""Author: MiYu. Verify exact source attachment poses, visibility and unchanged native mesh geometry."""
import argparse
import importlib
import json
import pathlib
import subprocess
import tempfile
import numpy as np

base = importlib.import_module('convert-frost-classic-billboards')
ROOT, LIBRARY = base.ROOT, base.LIBRARY
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--library', type=pathlib.Path, default=LIBRARY/'classic-attachment-ready')
p.add_argument('--reference', type=pathlib.Path, required=True)
p.add_argument('--probe', type=pathlib.Path, required=True)
p.add_argument('--output', type=pathlib.Path, default=ROOT/'docs/designs/frostbound-realms/classic-attachment-validation.json')
args = p.parse_args()
overrides, receipt_sha, receipt = base.load_overlay(args.library)
old, previous_sha, previous = base.load_overlay(LIBRARY/receipt['baseCollection'])
assert receipt['baseReceiptSha256'] == previous_sha
def run(command, **kw):
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', **kw)
    assert result.returncode == 0, result.stderr[:3000]
    return result.stdout
def probe(keys, look, nodes=False):
    camera = '--billboard-camera='+','.join(map(str,[*look,0,1,0]))
    return [json.loads(row) for row in run([str(args.probe.resolve()),'--stdin','--nodes' if nodes else '--positions',camera], input='\n'.join(keys)+'\n').splitlines()]
parts = 0
for a in receipt['annotations']:
    before, blob = base.read_glb(old[(a['pack'],base.key(a['path']))])
    after, binary = base.read_glb(overrides[(a['pack'],base.key(a['path']))])
    assert binary == blob
    for field in ['accessors','bufferViews','buffers','meshes','skins']: assert before[field] == after[field],(a['path'],field)
    parts += 1
results = []; loads = 0; comparisons = 0; max_error = 0.; max_matrix_error = 0.; visible = 0; hidden = 0; mesh_loads = 0
axes = np.array([[1.,0,0],[0,0,1],[0,-1,0]])
with tempfile.TemporaryDirectory(prefix='attachment-reference-',dir=ROOT/'tmp') as temp:
    for record in receipt['sourceFiles']:
        candidates = [a for a in receipt['annotations'] if a['pack'] == record['pack'] and base.key(a['source']) == base.key(record['path'])]
        a = candidates[0]
        path = args.library/a['output']; doc,_ = base.read_glb(path.read_bytes())
        mapping = {n['extras']['mengineSourceNode']['index']:i for i,n in enumerate(doc['nodes']) if 'mengineSourceNode' in n.get('extras',{})}
        model_loads = 0; model_error = 0.
        for rate,look in [(30,np.array([0.,-.7,-.71414284])),(60,np.array([-.8,-.6,0.]))]:
            up = np.array([0.,1.,0.]); up -= look*np.dot(up,look); up /= np.linalg.norm(up)
            source = LIBRARY/record['pack']/'SourceAssets'/pathlib.PureWindowsPath(record['path']).as_posix()
            target = pathlib.Path(temp)/'source.json'
            run(['dotnet',str(args.reference.resolve()),str(source),str(target),*map(str,[*(axes.T@look),*(axes.T@up)]),str(rate)])
            clips = json.loads(target.read_bytes())['clips']
            keys = []; expected = []
            for index,clip in enumerate(clips):
                for frame in clip['samples']:
                    keys.append(str(path.resolve())+f'#pose={index}:{frame["frame"]}@{rate}')
                    expected.append(frame['nodes'])
            rows = probe(keys,look,True); assert len(rows) == len(expected)
            for key,row,references in zip(keys,rows,expected):
                assert len(mapping) == len(references)
                for ref in references:
                    node = row['nodes'][mapping[ref['sourceNode']]]
                    error = float(np.max(np.abs(np.array(node['position'])-np.array(ref['position']))))
                    assert error < .5/128,(key,ref['sourceNode'],error,node['position'],ref['position'])
                    max_error = max(max_error,error); model_error = max(model_error,error); comparisons += 1
                    matrix_error = float(np.max(np.abs(np.array(node['matrix'])-np.array(ref['matrix']))))
                    assert matrix_error < .5/128,(key,ref['sourceNode'],'matrix',matrix_error)
                    max_matrix_error = max(max_matrix_error,matrix_error)
                    if ref['visibility'] is not None:
                        visibility = node['attachment']['visibility']; assert abs(visibility-ref['visibility'])<1e-5,(key,node,ref)
                        visible += int(visibility>0); hidden += int(visibility<=0)
            loads += len(keys); model_loads += len(keys)
        # Actual native geometry must remain identical after adding unskinned nodes.
        old_keys=[]; new_keys=[]
        for part in candidates:
            for frame in [0,3]:
                old_keys.append(str((LIBRARY/receipt['baseCollection']/part['output']).resolve())+f'#pose=0:{frame}@30')
                new_keys.append(str((args.library/part['output']).resolve())+f'#pose=0:{frame}@30')
        old_rows=probe(old_keys,np.array([0.,-.7,-.71414284])); new_rows=probe(new_keys,np.array([0.,-.7,-.71414284]))
        assert len(old_rows)==len(new_rows)==len(new_keys)
        for before,after in zip(old_rows,new_rows): assert before['positions']==after['positions'],(before['mesh'],after['mesh'])
        mesh_loads+=len(old_rows)+len(new_rows)
        results.append(dict(pack=record['pack'],source=record['path'],nodes=len(mapping),loads=model_loads,maxPositionError=model_error))
        print('PASS attachment source:',record['path'],model_loads,'poses; error',model_error,flush=True)
report=dict(passed=True,sourceModels=len(results),geometryParts=parts,nativeNodeLoads=loads,comparedNodePoses=comparisons,maxPositionError=max_error,maxMatrixError=max_matrix_error,visibleAttachments=visible,hiddenAttachments=hidden,nativeGeometryLoads=mesh_loads,binaryBuffersPreserved=True,nativeGeometryUnchanged=True,receiptSha256=receipt_sha,probeSha256=base.digest(args.probe.read_bytes()),referenceSha256=base.digest(args.reference.read_bytes()),models=results,scope='Complete classic source node matrices and pivots compared with pinned MDX animator at 30/60 Hz in two camera views, including attachment visibility key boundaries and terminal holds. External spell integration and embedded attachment child models require separate game validation.')
args.output.parent.mkdir(parents=True,exist_ok=True); args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('PASS exact attachment poses:',json.dumps({k:v for k,v in report.items() if k!='models'}))

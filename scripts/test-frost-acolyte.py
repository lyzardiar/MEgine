"""Author: MiYu. Validate Acolyte meshes, skin weights and every native animation sample."""
import hashlib, importlib.util, json, subprocess
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms';manifest=json.loads((sample/'acolyte-sources.json').read_text());catalog=json.loads((sample/'model-catalog.json').read_text())
for entry in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter);report=[]
for key in manifest['models']:
    asset=catalog[key];mesh=sample/asset['parts'][0]['mesh'];doc,blob=adapter.read_glb(mesh);assert len(doc['meshes'])==1 and len(doc['meshes'][0]['primitives'])==1
    primitive=doc['meshes'][0]['primitives'][0];a=primitive['attributes'];positions=adapter.accessor(doc,blob,a['POSITION']);normals=adapter.accessor(doc,blob,a['NORMAL']);uv=adapter.accessor(doc,blob,a['TEXCOORD_0']);weights=adapter.accessor(doc,blob,a['WEIGHTS_0']);joints=adapter.accessor(doc,blob,a['JOINTS_0']);indices=adapter.accessor(doc,blob,primitive['indices']).ravel()
    assert all(np.isfinite(v).all() for v in [positions,normals,uv,weights]);assert indices.min()>=0 and indices.max()<len(positions);assert uv.min()>=0 and uv.max()<=1;np.testing.assert_allclose(weights.sum(axis=1),1,atol=1e-5);assert joints.max()<len(doc['skins'][0]['joints']);assert len(indices)//3==manifest['modelStats'][key]['triangles']
    paths=[str(mesh)+'#pose='+str(clip)+':'+str(frame) for clip,animation in enumerate(asset['animations']) for frame in range(animation['frames'])]
    result=subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--',*paths],cwd=root,text=True);bounds=[json.loads(line) for line in result.splitlines()];assert len(bounds)==len(paths)
    for frame in bounds:
        low=np.array(frame['min']);high=np.array(frame['max']);assert np.isfinite(low).all() and np.isfinite(high).all();assert (high-low<6).all();assert low[1]>-.45 and high[1]<5.5,(key,frame)
    report.append({'model':key,'triangles':len(indices)//3,'bones':len(doc['skins'][0]['joints']),'nativeSamples':len(bounds),'minimumY':min(b['min'][1] for b in bounds),'maximumY':max(b['max'][1] for b in bounds)})
(root/'docs/designs/frostbound-realms/acolyte-import-qa.json').write_text(json.dumps({'passed':True,'models':report},indent=2)+'\n');print('PASS:',sum(r['nativeSamples'] for r in report),'native acolyte poses, finite geometry, skin weights, source hashes and bounded attachments')

"""Author: MiYu. Validate licensed wildlife skinning, animated scale and native poses."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import numpy as np

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'wildlife-sources.json').read_text());catalog=json.loads((sample/'model-catalog.json').read_text());report={'passed':True,'models':{}}
for entry in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
assert manifest['license']=='CC-BY-SA-3.0' and manifest['author']=='Wildfire Games'
for key in manifest['models']:
    asset=catalog[key];doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh']);assert len(doc['meshes'])==len(doc['skins'])==1
    primitive=doc['meshes'][0]['primitives'][0];attrs=primitive['attributes'];points=adapter.accessor(doc,blob,attrs['POSITION']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);weights=adapter.accessor(doc,blob,attrs['WEIGHTS_0']);joints=adapter.accessor(doc,blob,attrs['JOINTS_0']);indices=adapter.accessor(doc,blob,primitive['indices']).ravel()
    assert all(np.isfinite(a).all() for a in [points,uv,weights]);assert weights.shape==(len(points),4) and weights.min()>=0;np.testing.assert_allclose(weights.sum(axis=1),1,atol=1e-5)
    assert joints.max()<len(doc['skins'][0]['joints']);assert uv.min()>=-1e-6 and uv.max()<=1.000001;assert indices.min()>=0 and indices.max()<len(points) and len(indices)%3==0
    assert [a['name'] for a in doc['animations']]==['Idle','Walk','Attack','Death'];weighted={doc['skins'][0]['joints'][int(j)] for j in joints[weights>0]};references=[];motion={}
    for i,clip in enumerate(doc['animations']):
        moving={doc['nodes'][c['target']['node']]['name'] for c in clip['channels'] if c['target']['node'] in weighted and np.ptp(adapter.accessor(doc,blob,clip['samplers'][c['sampler']]['output']),axis=0).max()>.01};motion[clip['name']]=sorted(moving);assert moving,clip['name']
        if i==1:assert any('leg' in n.lower() or 'paw' in n.lower() for n in moving),'weighted legs must move'
        for frame in range(asset['animations'][i]['frames']):references.append(str(sample/asset['parts'][0]['mesh'])+f'#pose={i}:{frame}')
    output=subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--',*references],cwd=root,text=True);bounds=[json.loads(line) for line in output.splitlines()];assert len(bounds)==len(references)
    for b in bounds:
        low=np.array(b['min']);high=np.array(b['max']);assert np.isfinite(low).all() and np.isfinite(high).all();assert -.6<low[1]<.3 and np.max(high-low)<4.2,b
    idle=bounds[0];size=np.array(idle['max'])-np.array(idle['min']);np.testing.assert_allclose(size,asset['size'],rtol=.1,atol=.12,err_msg='source armature object scale must be applied before native pose sampling')
    death=bounds[-1];assert death['max'][1]-death['min'][1]<size[1]*.85,'death settles close to the ground'
    assert len({tuple(round(v,3) for v in b['max']) for b in bounds})>20
    report['models'][key]={'triangles':len(indices)//3,'bones':len(doc['skins'][0]['joints']),'nativePoseSamples':len(bounds),'movingWeightedBones':motion,'bounds':bounds}
report['sourceFiles']=len(manifest['sources']);report['generatedFiles']=len(manifest['generated']);(root/'docs/designs/frostbound-realms/wildlife-import-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: wildlife source/derived hashes, normalized skinning, four weighted animations, authored scale and all native poses')

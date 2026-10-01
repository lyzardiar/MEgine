"""Author: MiYu. Validate abomination sources, skinning, materials and native poses."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'abomination-sources.json').read_text());asset=json.loads((sample/'model-catalog.json').read_text())['RealAbomination'];doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh'])
for entry in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
assert manifest['license']=='CC-BY-3.0' and manifest['author']=='piacenti'
assert len(doc['meshes'])==len(doc['skins'])==1 and len(doc['skins'][0]['joints'])==34
primitive=doc['meshes'][0]['primitives'][0];attrs=primitive['attributes'];points=adapter.accessor(doc,blob,attrs['POSITION']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);weights=adapter.accessor(doc,blob,attrs['WEIGHTS_0']);joints=adapter.accessor(doc,blob,attrs['JOINTS_0']);indices=adapter.accessor(doc,blob,primitive['indices']).ravel()
assert all(np.isfinite(a).all() for a in [points,uv,weights]);assert weights.shape==(len(points),4) and weights.min()>=0;np.testing.assert_allclose(weights.sum(axis=1),1,atol=1e-5)
assert joints.max()<34 and uv.min()>=-1e-6 and uv.max()<=1.000001;assert indices.min()>=0 and indices.max()<len(points) and len(indices)%3==0
assert len(indices)//3==manifest['models']['RealAbomination']['triangles']
attachment_vertices={};joint_names=[doc['nodes'][i]['name'] for i in doc['skins'][0]['joints']]
for finish,(u,v) in {'iron':(.86,.76),'edge':(.94,.76),'wood':(.86,.84),'scar':(.94,.84),'thread':(.86,.92)}.items():
    selected=(np.abs(uv[:,0]-u)<.026)&(np.abs(uv[:,1]-(1-v))<.026);assert selected.any(),finish;attachment_vertices[finish]=int(selected.sum());names={joint_names[int(j)] for j in joints[selected][weights[selected]>1e-5]}
    if finish in ['iron','edge','wood']:
        assert names<=({'hand.R'} if finish=='edge' else {'hand.R','hand.L'}),(finish,names);np.testing.assert_allclose(weights[selected].max(axis=1),1,atol=1e-5)
    else:assert not names&{'hand.R','hand.L'},(finish,names)
assert [a['name'] for a in doc['animations']]==['Idle','Walk','Attack','Death','Cannibalize'];weighted={doc['skins'][0]['joints'][int(j)] for j in joints[weights>0]};references=[];motion={}
for i,clip in enumerate(doc['animations']):
    assert all(s.get('interpolation','LINEAR') in ['LINEAR','STEP'] for s in clip['samplers'])
    moving={doc['nodes'][c['target']['node']]['name'] for c in clip['channels'] if c['target']['node'] in weighted and np.ptp(adapter.accessor(doc,blob,clip['samplers'][c['sampler']]['output']),axis=0).max()>.005};motion[clip['name']]=sorted(moving);assert moving,clip['name']
    if i==1:assert any('shin' in n or 'foot' in n for n in moving)
    if i==2:assert any('arm' in n for n in moving)
    for frame in range(asset['animations'][i]['frames']):references.append(str(sample/asset['parts'][0]['mesh'])+f'#pose={i}:{frame}')
output=subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--',*references],cwd=root,text=True);bounds=[json.loads(line) for line in output.splitlines()];assert len(bounds)==len(references)
for b in bounds:
    low=np.array(b['min']);high=np.array(b['max']);assert np.isfinite(low).all() and np.isfinite(high).all();assert -.7<low[1]<.3 and np.max(high-low)<7,b
size=np.array(bounds[0]['max'])-np.array(bounds[0]['min']);np.testing.assert_allclose(size,asset['size'],rtol=.1,atol=.15)
death=bounds[sum(a['frames'] for a in asset['animations'][:4])-1]
assert death['max'][1]-death['min'][1]<size[1]*.65,'death lowers the body'
assert len({tuple(round(v,3) for v in b['min']+b['max']) for b in bounds})>30
material=json.loads((sample/asset['material']).read_text());textures={}
for channel in ['base_color_texture','normal_texture','metallic_roughness_texture']:
    image=Image.open(sample/material[channel]);assert image.size==(3072,2048);pixels=np.array(image);assert pixels[:,:,:3].std(axis=(0,1)).max()>5;textures[channel]={'size':list(image.size),'sha256':hashlib.sha256((sample/material[channel]).read_bytes()).hexdigest()}
license=(sample/'Assets/Licenses/piacenti-Abomination.txt').read_text();assert manifest['author'] in license and 'CC-BY-3.0' in license and 'unit-portraits.png' in license
arm=np.array(Image.open(sample/material['metallic_roughness_texture']));assert arm[2048-int(.76*2048),int(.94*3072),2]>200;assert arm[400,400,2]==0
report={'passed':True,'sourceFiles':len(manifest['sources']),'generatedFiles':len(manifest['generated']),'triangles':len(indices)//3,'bones':34,'nativePoseSamples':len(bounds),'attachmentVertices':attachment_vertices,'movingWeightedBones':motion,'textures':textures,'bounds':bounds};(root/'docs/designs/frostbound-realms/abomination-import-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: abomination attribution and hashes, textured body, four-bone weights, authored animations and every native pose')

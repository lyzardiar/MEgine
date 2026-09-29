"""Author: MiYu. Validate mounted equipment, opacity, skeletal motion and native cavalry poses."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'cavalry-sources.json').read_text());asset=json.loads((sample/'model-catalog.json').read_text())['RealKnight']
for entry in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh']);assert len(doc['meshes'])==len(doc['skins'])==1
primitive=doc['meshes'][0]['primitives'][0];attrs=primitive['attributes'];points=adapter.accessor(doc,blob,attrs['POSITION']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);weights=adapter.accessor(doc,blob,attrs['WEIGHTS_0']);joints=adapter.accessor(doc,blob,attrs['JOINTS_0']);indices=adapter.accessor(doc,blob,primitive['indices']).ravel()
assert all(np.isfinite(a).all() for a in [points,uv,weights]);assert weights.shape==(len(points),4) and weights.min()>=0;np.testing.assert_allclose(weights.sum(axis=1),1,atol=1e-5)
assert indices.min()>=0 and indices.max()<len(points) and len(indices)%3==0;assert joints.max()<len(doc['skins'][0]['joints']);assert uv.min()>=-1e-6 and uv.max()<=1.000001
names=[doc['nodes'][node]['name'] for node in doc['skins'][0]['joints']];assert len(names)==188
rider=[i for i,n in enumerate(names) if n.startswith('rider_')];assert len(rider)>=100
rider_mask=np.sum(np.where(np.isin(joints,rider),weights,0),axis=1)>.99;assert rider_mask.sum()>500
equipment={}
for name in ['prop-head','prop-helmet','prop-weapon_R','prop-shield']:
    joint=names.index('rider_'+name);mask=np.sum(np.where(joints==joint,weights,0),axis=1)>.99;assert mask.sum()>20,name;equipment[name]=int(mask.sum())
assert [a['name'] for a in doc['animations']]==['Idle','Walk','Attack'];motion={};references=[]
weighted={doc['skins'][0]['joints'][int(j)] for j in joints[weights>0]}
for index,clip in enumerate(doc['animations']):
    moving={doc['nodes'][c['target']['node']]['name'] for c in clip['channels'] if c['target']['node'] in weighted and np.ptp(adapter.accessor(doc,blob,clip['samplers'][c['sampler']]['output']),axis=0).max()>.01};motion[clip['name']]=sorted(moving)
    if index==1:assert any(not n.startswith('rider_') and 'leg' in n.lower() for n in moving),'horse legs must gallop'
    if index==2:assert any(n.startswith('rider_') and 'arm' in n for n in moving),'rider must swing sword'
    for frame in range(asset['animations'][index]['frames']):references.append(str(sample/asset['parts'][0]['mesh'])+f'#pose={index}:{frame}')
mat=json.loads((sample/asset['material']).read_text());assert mat['surface']=='cutout' and mat['alpha_cutoff']==.3
base=Image.open(sample/mat['base_color_texture']);assert base.mode=='RGBA';alpha=np.array(base)[:,:,3];assert (alpha==0).sum()>100 and (alpha==255).sum()>1000
# Sample triangle interiors belonging to the rider: player-color masks must stay opaque.
faces=indices.reshape(-1,3);rider_faces=faces[rider_mask[faces].all(axis=1)];centers=uv[rider_faces].mean(axis=1);pixels=np.clip((centers*np.array(base.size)).astype(int),0,1023);ab=uv[rider_faces[:,1]]-uv[rider_faces[:,0]];ac=uv[rider_faces[:,2]]-uv[rider_faces[:,0]];area=np.abs(ab[:,0]*ac[:,1]-ab[:,1]*ac[:,0]);opaque=alpha[pixels[:,1],pixels[:,0]]>=round(mat['alpha_cutoff']*255);assert area[opaque].sum()/area.sum()>.995
output=subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--',*references],cwd=root,text=True)
bounds=[json.loads(line) for line in output.splitlines()];assert len(bounds)==48
for result in bounds:
    low=np.array(result['min']);high=np.array(result['max']);assert np.isfinite(low).all() and np.isfinite(high).all();assert 2.5<high[1]-low[1]<6 and np.max(high-low)<7,result;assert -.8<low[1]<1,result
assert len({tuple(round(v,3) for v in r['max']) for r in bounds})>20,'native geometry follows all clips'
report={'passed':True,'sourceFiles':len(manifest['sources']),'generatedFiles':len(manifest['generated']),'triangles':len(indices)//3,'bones':len(names),'equipmentVertices':equipment,'nativePoseSamples':len(bounds),'riderOpaque':True,'hairCutout':True,'movingWeightedBones':motion,'bounds':bounds}
(root/'docs/designs/frostbound-realms/cavalry-import-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: mounted rider/equipment, normalized skinning, opaque armor/cutout hair and 48 native cavalry poses')

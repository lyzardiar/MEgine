"""Author: MiYu. Validate siege geometry, weighted mechanical motion and native sampled bounds."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import numpy as np

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'siege-sources.json').read_text());catalog=json.loads((sample/'model-catalog.json').read_text());references=[];triangles={};motion={};crew_feet={}
assert len(manifest['models'])==7
for entry in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
for key,definition in manifest['models'].items():
    asset=catalog[key];doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh']);assert len(doc['meshes'])==len(doc['skins'])==1
    primitive=doc['meshes'][0]['primitives'][0];attrs=primitive['attributes'];points=adapter.accessor(doc,blob,attrs['POSITION']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);weights=adapter.accessor(doc,blob,attrs['WEIGHTS_0']);joints=adapter.accessor(doc,blob,attrs['JOINTS_0']);indices=adapter.accessor(doc,blob,primitive['indices']).ravel()
    assert all(np.isfinite(a).all() for a in [points,uv,weights]);assert weights.shape==(len(points),4) and weights.min()>=0;np.testing.assert_allclose(weights.sum(axis=1),1,atol=1e-5)
    assert indices.min()>=0 and indices.max()<len(points) and len(indices)%3==0;assert joints.max()<len(doc['skins'][0]['joints']);assert uv.min()>=-1e-6 and uv.max()<=1.000001
    assert [a['name'] for a in doc['animations']]==['Idle','Walk','Attack'];triangles[key]=len(indices)//3
    weighted={doc['skins'][0]['joints'][int(j)] for j in joints[weights>0]};attack=doc['animations'][2]
    moving=[doc['nodes'][c['target']['node']]['name'] for c in attack['channels'] if c['target']['node'] in weighted and np.ptp(adapter.accessor(doc,blob,attack['samplers'][c['sampler']]['output']),axis=0).max()>.01]
    assert moving,(key,'attack must move weighted machinery bones');motion[key]=sorted(set(moving))
    if definition.get('crewCount'):
        sampled=json.loads(subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--','--positions',str(sample/asset['parts'][0]['mesh'])+'#pose=2:0'],cwd=root,text=True));posed=np.array(sampled['positions']);assert len(posed)==len(points)
        assert asset['crewCount']==definition['crewCount'];assert asset['animations'][1]['frames']>=12,'crew walk cycle must not be compressed into the short machinery idle clip'
        for number in range(1,definition['crewCount']+1):
            prefix=f'crew{number}_';crew_joints=[i for i,node in enumerate(doc['skins'][0]['joints']) if doc['nodes'][node]['name'].startswith(prefix)];assert len(crew_joints)>=100
            mask=np.sum(np.where(np.isin(joints,crew_joints),weights,0),axis=1)>.99;assert mask.sum()>500,(key,prefix,'operator geometry')
            assert any(name.startswith(prefix) and any(part in name for part in ['arm','hand']) for name in moving),(key,prefix,'arms must follow the authored mechanical cycle')
            feet=[i for i,node in enumerate(doc['skins'][0]['joints']) if doc['nodes'][node]['name'] in [prefix+'foot_L',prefix+'foot_R']];foot_points=posed[np.sum(np.where(np.isin(joints,feet),weights,0),axis=1)>.5];assert len(foot_points)>20
            assert np.ptp(foot_points[:,1])<.5 and -.2<foot_points[:,1].min()<.6,(key,prefix,'feet retain their shape on the ground or low timber platform');crew_feet[key+' '+prefix]=[float(foot_points[:,1].min()),float(foot_points[:,1].max())]
            for attachment in ['prop-head','prop-helmet']:
                joint=next(i for i,node in enumerate(doc['skins'][0]['joints']) if doc['nodes'][node]['name']==prefix+attachment);assert (np.sum(np.where(joints==joint,weights,0),axis=1)>.99).sum()>20,(key,prefix,attachment)
    for index,clip in enumerate(asset['animations']):
        for frame in [0,clip['frames']//2,clip['frames']-1]:references.append(str(sample/asset['parts'][0]['mesh'])+f'#pose={index}:{frame}')
    if not key.endswith('Shoot') and definition.get('shotModel'):
        assert triangles[key]>triangles[definition['shotModel']],(key,'loaded projectile geometry is missing')
        projectile=next(i for i,n in enumerate(doc['skins'][0]['joints']) if doc['nodes'][n]['name']=='prop_projectile');mask=np.sum(np.where(joints==projectile,weights,0),axis=1)>.99
        assert mask.sum()>20 and np.linalg.norm(np.ptp(points[mask],axis=0))>.1,(key,'loaded prop has real geometry')
        shoot_doc,_=adapter.read_glb(sample/catalog[definition['shotModel']]['parts'][0]['mesh'])
        np.testing.assert_allclose(doc['nodes'][doc['scenes'][0]['nodes'][0]]['scale'],shoot_doc['nodes'][shoot_doc['scenes'][0]['nodes'][0]]['scale'],atol=1e-6)
output=subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--',*references],cwd=root,text=True)
bounds=[json.loads(line) for line in output.splitlines()];assert len(bounds)==63
for result in bounds:
    low=np.array(result['min']);high=np.array(result['max']);assert np.isfinite(low).all() and np.isfinite(high).all();assert .5<high[1]-low[1]<8 and np.max(high-low)<12,result;assert -.8<low[1]<.8,result
report={'passed':True,'models':7,'sourceFiles':len(manifest['sources']),'generatedFiles':len(manifest['generated']),'nativePoseSamples':len(bounds),'triangles':triangles,'movingWeightedBones':motion,'crewFootBounds':crew_feet,'bounds':bounds}
(root/'docs/designs/frostbound-realms/siege-import-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: 7 siege models, source/generated hashes, loaded projectiles, mechanical motion and 63 native pose samples')

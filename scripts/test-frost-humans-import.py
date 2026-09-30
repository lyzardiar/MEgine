"""Author: MiYu. Check human skinning, equipment scale, animation clips and native pose bounds."""
import importlib.util
import json
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'human-sources.json').read_text());catalog=json.loads((sample/'model-catalog.json').read_text());references=[];groups=[]
for key in manifest['models']:
    asset=catalog[key];doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh']);assert len(doc['meshes'])==len(doc['skins'])==1 and len(doc['meshes'][0]['primitives'])==1
    primitive=doc['meshes'][0]['primitives'][0];attrs=primitive['attributes'];p=adapter.accessor(doc,blob,attrs['POSITION']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);weights=adapter.accessor(doc,blob,attrs['WEIGHTS_0']);joints=adapter.accessor(doc,blob,attrs['JOINTS_0']);indices=adapter.accessor(doc,blob,primitive['indices']).ravel()
    assert np.isfinite(p).all() and np.isfinite(uv).all() and np.isfinite(weights).all();assert indices.min()>=0 and indices.max()<len(p) and len(indices)%3==0
    assert weights.shape==(len(p),4);assert joints.max()<len(doc['skins'][0]['joints']);np.testing.assert_allclose(weights.sum(axis=1),1,atol=1e-5);assert weights.min()>=0
    assert uv.min()>=-1e-6 and uv.max()<=1.000001
    tool=next(p for p in manifest['models'][key]['parts'] if (p['bone'] or '').startswith('prop-weapon_'))
    for bone,minimum in [('prop-head',.35),(tool['bone'],.5 if asset.get('workAnimation') or tool.get('skeletal') else 1.2)]:
        names=list(['Bow_String','Bow_Root','Bow_Branch_Top','Bow_Branch_Bot']) if bone==tool['bone'] and tool.get('skeletal') else [bone]
        joint_ids=[i for i,n in enumerate(doc['skins'][0]['joints']) if doc['nodes'][n]['name'] in names];assert len(joint_ids)==len(names);mask=np.sum(np.where(np.isin(joints,joint_ids),weights,0),axis=1)>.99;points=p[mask]
        assert len(points)>20,(key,bone);assert minimum<np.linalg.norm(np.ptp(points,axis=0))<3,(key,bone,'equipment uses body units')
    assert [a['name'] for a in doc['animations']]==[a['name'] for a in asset['animations']]==list(manifest['models'][key]['animations'])
    groups.append((len(references),len(doc['animations'])*3))
    for i,clip in enumerate(doc['animations']):
        assert all(s.get('interpolation','LINEAR') in ['LINEAR','STEP'] for s in clip['samplers']);duration=max(adapter.accessor(doc,blob,s['input']).max() for s in clip['samplers']);assert round(float(duration)*12)==asset['animations'][i]['frames']
        for frame in [0,asset['animations'][i]['frames']//2,asset['animations'][i]['frames']-1]:references.append(str(sample/asset['parts'][0]['mesh'])+f'#pose={i}:{frame}')
    if tool.get('skeletal'):
        bow_node=next(i for i,n in enumerate(doc['nodes']) if n.get('name')=='Bow_String');clip=doc['animations'][2]
        channels=[c for c in clip['channels'] if c['target']['node']==bow_node];assert channels
        assert any(np.ptp(adapter.accessor(doc,blob,clip['samplers'][c['sampler']]['output']),axis=0).max()>.05 for c in channels),'bow string must deform during the shot'
    mat=json.loads((sample/asset['material']).read_text());assert mat['shader']=='pbr'
    for field in ['base_color_texture','normal_texture','metallic_roughness_texture']:assert Image.open(sample/mat[field]).size==(1024,1024)
    print(key,len(indices)//3,'triangles;',len(doc['skins'][0]['joints']),'bones; head/tool scale and four normalized weights valid')
output=subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--',*references],cwd=root,text=True)
results=[json.loads(line) for line in output.splitlines()];assert len(results)==len(references)
for result in results:
    low=np.array(result['min']);high=np.array(result['max']);assert np.isfinite(low).all() and np.isfinite(high).all();key=Path(result['mesh'].split('#pose=')[0]).stem;clip=int(result['mesh'].split('#pose=')[1].split(':')[0]);minimum=.2 if catalog[key]['animations'][clip]['name']=='Death' else 1 if 'RealWorkerBuild.glb' in result['mesh'] else 1.5
    assert minimum<high[1]-low[1]<4.5 and np.max(high-low)<6,result;assert -.6<low[1]<.6,'feet remain near ground'
for start,count in groups:assert len({tuple(round(v,3) for v in r['max']) for r in results[start:start+count]})>=min(5,count-1),'native geometry changes with the authored clips'
print('PASS:',len(results),'native skeletal samples, complete equipment and stable pose bounds')

arrow=sample/'Assets/Models/RealArrow.glb';doc,blob=adapter.read_glb(arrow);primitive=doc['meshes'][0]['primitives'][0];points=adapter.accessor(doc,blob,primitive['attributes']['POSITION']);assert np.isfinite(points).all();assert abs(np.ptp(points[:,2])-1.5)<1e-5 and np.ptp(points[:,:2],axis=0).max()<.12
front=points[points[:,2]>points[:,2].max()-.02];assert np.ptp(front[:,:2],axis=0).max()<.02,'arrow tip faces local positive Z'
print('PASS: arrow projectile is 1.5 units long, bounded and points along flight')

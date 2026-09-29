"""Author: MiYu. Check human skinning, equipment scale, animation clips and native pose bounds."""
import importlib.util
import json
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'human-sources.json').read_text());catalog=json.loads((sample/'model-catalog.json').read_text());references=[]
for key in manifest['models']:
    asset=catalog[key];doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh']);assert len(doc['meshes'])==len(doc['skins'])==1 and len(doc['meshes'][0]['primitives'])==1
    primitive=doc['meshes'][0]['primitives'][0];attrs=primitive['attributes'];p=adapter.accessor(doc,blob,attrs['POSITION']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);weights=adapter.accessor(doc,blob,attrs['WEIGHTS_0']);joints=adapter.accessor(doc,blob,attrs['JOINTS_0']);indices=adapter.accessor(doc,blob,primitive['indices']).ravel()
    assert np.isfinite(p).all() and np.isfinite(uv).all() and np.isfinite(weights).all();assert indices.min()>=0 and indices.max()<len(p) and len(indices)%3==0
    assert weights.shape==(len(p),4);assert joints.max()<len(doc['skins'][0]['joints']);np.testing.assert_allclose(weights.sum(axis=1),1,atol=1e-5);assert weights.min()>=0
    assert uv.min()>=-1e-6 and uv.max()<=1.000001
    for bone,minimum in [('prop-head',.35),('prop-weapon_R',1.2)]:
        joint=next(i for i,n in enumerate(doc['skins'][0]['joints']) if doc['nodes'][n]['name']==bone);mask=np.any((joints==joint)&(weights>.99),axis=1);points=p[mask]
        assert len(points)>20,(key,bone);assert minimum<np.linalg.norm(np.ptp(points,axis=0))<3,(key,bone,'equipment uses body units')
    assert [a['name'] for a in doc['animations']]==[a['name'] for a in asset['animations']]==['Idle','Walk','Sword_Attack']
    for i,clip in enumerate(doc['animations']):
        assert all(s.get('interpolation','LINEAR') in ['LINEAR','STEP'] for s in clip['samplers']);duration=max(adapter.accessor(doc,blob,s['input']).max() for s in clip['samplers']);assert round(float(duration)*12)==asset['animations'][i]['frames']
        for frame in [0,asset['animations'][i]['frames']//2,asset['animations'][i]['frames']-1]:references.append(str(sample/asset['parts'][0]['mesh'])+f'#pose={i}:{frame}')
    mat=json.loads((sample/asset['material']).read_text());assert mat['shader']=='pbr'
    for field in ['base_color_texture','normal_texture','metallic_roughness_texture']:assert Image.open(sample/mat[field]).size==(1024,1024)
    print(key,len(indices)//3,'triangles;',len(doc['skins'][0]['joints']),'bones; head/tool scale and four normalized weights valid')
output=subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--',*references],cwd=root,text=True)
results=[json.loads(line) for line in output.splitlines()];assert len(results)==18
for result in results:
    low=np.array(result['min']);high=np.array(result['max']);assert np.isfinite(low).all() and np.isfinite(high).all();assert 1.5<high[1]-low[1]<4.5 and np.max(high-low)<6;assert -.6<low[1]<.6,'feet remain near ground'
for group in [results[:9],results[9:]]:assert len({tuple(round(v,3) for v in r['max']) for r in group})>=5,'native geometry changes with the authored clips'
print('PASS: eighteen native skeletal samples, complete equipment and stable pose bounds')

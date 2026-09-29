"""Author: MiYu. Validate imported building geometry, UVs and physically shaded material atlases."""
import importlib.util
import json
from pathlib import Path
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'warclans-sources.json').read_text());catalog=json.loads((sample/'model-catalog.json').read_text())
for key in manifest['models']:
    asset=catalog[key];doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh']);assert len(doc['meshes'])==1 and len(doc['meshes'][0]['primitives'])==1
    primitive=doc['meshes'][0]['primitives'][0];attrs=primitive['attributes'];p=adapter.accessor(doc,blob,attrs['POSITION']);n=adapter.accessor(doc,blob,attrs['NORMAL']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);idx=adapter.accessor(doc,blob,primitive['indices']).ravel()
    assert all(np.isfinite(a).all() for a in [p,n,uv]);assert idx.min()>=0 and idx.max()<len(p);assert len(idx)%3==0 and 100<len(idx)//3<15000
    np.testing.assert_allclose(p.max(axis=0)-p.min(axis=0),asset['size'],atol=1e-5);assert abs(p[:,1].min())<1e-5
    np.testing.assert_allclose((p.max(axis=0)+p.min(axis=0))[[0,2]],0,atol=1e-5);np.testing.assert_allclose(np.linalg.norm(n,axis=1),1,atol=1e-4);assert uv.min()>=-1e-6 and uv.max()<=1.000001
    mat=json.loads((sample/asset['material']).read_text());assert mat['shader']=='pbr' and mat['metallic']==0 and mat['roughness']==1;assert mat['occlusion_texture']==mat['metallic_roughness_texture']
    images={channel:np.array(Image.open(sample/mat[path]).convert('RGB')) for channel,path in [('base','base_color_texture'),('normal','normal_texture'),('arm','metallic_roughness_texture')]}
    assert all(im.shape==(1024,1024,3) for im in images.values());assert len(np.unique(images['base'].reshape(-1,3),axis=0))>1000,'source surface color survives the bake'
    # Sample triangle interiors, avoiding empty atlas gutters and UV seam padding.
    points=uv[idx.reshape(-1,3)].mean(axis=1);pixels=np.clip((points*1024).astype(int),0,1023);normal=images['normal'][pixels[:,1],pixels[:,0]];arm=images['arm'][pixels[:,1],pixels[:,0]]
    assert np.median(normal[:,2])>160,'normal atlas faces outward';assert np.median(arm[:,1])>100,'rough surfaces retain a roughness channel';assert arm[:,2].max()==0,'architecture remains dielectric'
    print(key,len(idx)//3,'triangles; geometry, normals, UVs and texture channels valid')
print('PASS: eight authored Warclans buildings and three-channel material atlases')

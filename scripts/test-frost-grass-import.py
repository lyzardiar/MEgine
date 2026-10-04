"""Author: MiYu. Pinned 3D grass surfaces, preserved geometry and seasonal cutout textures."""
import hashlib
import importlib.util
import json
from pathlib import Path
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms';manifest=json.loads((sample/'realistic-sources.json').read_text())
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
grass=next(a for a in manifest['assets'] if a['id']=='grass_medium_01');doc=json.loads((sample/'SourceAssets/polyhaven/grass_medium_01/grass_medium_01_1k.gltf').read_text());blob=(sample/'SourceAssets/polyhaven/grass_medium_01/grass_medium_01.bin').read_bytes()
for item in manifest['sources']:
    if item['asset']=='grass_medium_01':assert hashlib.sha256((sample/item['file']).read_bytes()).hexdigest()==item['sha256']
for name,node in zip(grass['names'],grass['source_nodes'],strict=True):
    original=next(n for n in doc['nodes'] if n.get('name')==node);triangles=sum(doc['accessors'][p['indices']]['count']//3 for p in doc['meshes'][original['mesh']]['primitives'])
    for suffix in ['', '-far']:
        data=(sample/('Assets/Models/'+name+suffix+'.glb')).read_bytes();size=int.from_bytes(data[12:16],'little');model=json.loads(data[20:20+size]);binary=data[28+size:];prim=model['meshes'][0]['primitives'][0];p=adapter.accessor(model,binary,prim['attributes']['POSITION']);normals=adapter.accessor(model,binary,prim['attributes']['NORMAL'])
        assert model['accessors'][prim['indices']]['count']//3==triangles<=1300
        assert np.linalg.matrix_rank(p-p.mean(axis=0))==3 and np.ptp(p,axis=0).min()>.05
        assert np.isfinite(p).all() and np.isfinite(normals).all();assert np.allclose(np.linalg.norm(normals,axis=1),1,atol=1e-4)
    assert all(lod['triangles']==triangles and lod['error']==0 for lod in manifest['models'][name]['lods'])
green=np.array(Image.open(sample/'Assets/Textures/Real_grass_medium_01_base.png'));dry=np.array(Image.open(sample/'Assets/Textures/Real_grass_medium_01_dry.png'))
assert green.shape==dry.shape==(1024,1024,4);assert green[:,:,3].min()==0 and green[:,:,3].max()==255;np.testing.assert_array_equal(green[:,:,3],dry[:,:,3]);assert not np.array_equal(green[:,:,:3],dry[:,:,:3])
for suffix in ['', '_dry']:
    mat=json.loads((sample/('Assets/Materials/Real_grass_medium_01'+suffix+'.mmat')).read_text());assert mat['surface']=='cutout' and mat['alpha_cutoff']==.3 and mat['double_sided'];assert mat['normal_texture']=='Assets/Textures/Real_grass_medium_01_normal.png'
print(json.dumps({'passed':True,'variants':3,'triangles':[manifest['models'][name]['lods'][0]['triangles'] for name in grass['names']],'originalGeometryPreserved':True,'twoSeasonalCutoutMaterials':True}))

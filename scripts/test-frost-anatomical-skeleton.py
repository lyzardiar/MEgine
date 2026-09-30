"""Author: MiYu. Verify anatomical source provenance, skin weights, baked AO and native bounds."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'anatomical-skeleton-sources.json').read_text());asset=json.loads((sample/'model-catalog.json').read_text())['SkeletonBody']
for entry in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
assert manifest['author']=='Gord Goodwin' and manifest['license']=='CC0-1.0'
doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh']);assert len(doc['meshes'])==len(doc['skins'])==1 and not doc.get('animations')
primitive=doc['meshes'][0]['primitives'][0];attrs=primitive['attributes']
positions=adapter.accessor(doc,blob,attrs['POSITION']);weights=adapter.accessor(doc,blob,attrs['WEIGHTS_0']);joints=adapter.accessor(doc,blob,attrs['JOINTS_0']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);indices=adapter.accessor(doc,blob,primitive['indices']).ravel()
assert all(np.isfinite(v).all() for v in [positions,weights,uv]);assert weights.shape==(len(positions),4) and weights.min()>=0
np.testing.assert_allclose(weights.sum(axis=1),1,atol=1e-5);assert joints.max()<len(doc['skins'][0]['joints'])
assert indices.min()>=0 and indices.max()<len(positions) and len(indices)//3==15581
assert uv.min()>=-1e-6 and uv.max()<=1.000001
weighted={doc['nodes'][doc['skins'][0]['joints'][int(j)]]['name'] for j in joints[weights>0]}
assert {'HEAD','JAW','PELVIS','HUMERUS.L','HUMERUS.R','FEMUR.L','FEMUR.R','HAND.L','HAND.R'}<=weighted
bounds=json.loads(subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--',str(sample/asset['parts'][0]['mesh'])],cwd=root,text=True))
np.testing.assert_allclose(np.array(bounds['max'])-bounds['min'],asset['size'],rtol=1e-5,atol=1e-5);assert abs(bounds['min'][1])<1e-5 and abs(bounds['max'][1]-3.2)<1e-5
material=json.loads((sample/asset['material']).read_text());pixels=np.asarray(Image.open(sample/material['base_color_texture']).convert('RGB'));assert pixels.shape==(1024,1024,3)
centers=uv[indices.reshape(-1,3)].mean(axis=1);samples=pixels[np.clip(((1-centers[:,1])*1024).astype(int),0,1023),np.clip((centers[:,0]*1024).astype(int),0,1023),0]
assert samples.std()>3 and np.percentile(samples,90)>200,'bone occlusion retains both recessed and exposed surfaces'
assert 'Gord Goodwin' in (sample/'Assets/Licenses/Gord-Goodwin-Skeleton.txt').read_text()
report={'passed':True,'sources':len(manifest['sources']),'generated':len(manifest['generated']),'triangles':len(indices)//3,'bones':len(doc['skins'][0]['joints']),'weightedBones':len(weighted),'nativeBounds':bounds,'occlusionSamples':{'min':int(samples.min()),'max':int(samples.max()),'std':float(samples.std())},'scope':'Static rigged anatomical body; no gameplay unit replacement or animation acceptance'}
(root/'docs/designs/frostbound-realms/anatomical-skeleton-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: anatomical source hashes/license, normalized skinning, AO, native bounds; animation not supplied')

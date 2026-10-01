"""Author: MiYu. Verify cathedral provenance, packed exterior geometry and PBR atlas."""
import hashlib, importlib.util, json, subprocess
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'temple-sources.json').read_text());assert manifest['license']=='CC0-1.0'
for entry in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
license=(sample/'Assets/Licenses/Medieval-Temple.txt').read_bytes();assert license==(sample/'Licenses/Medieval-Temple.txt').read_bytes();assert all(n.encode() in license for n in ['Daniel Andersson','AnyRPG','CC0-1.0','RealTemple'])
asset=json.loads((sample/'model-catalog.json').read_text())['RealTemple'];assert asset['factionBuilding'];model=sample/asset['parts'][0]['mesh'];doc,blob=adapter.read_glb(model);assert len(doc['meshes'])==1 and len(doc['meshes'][0]['primitives'])==1
p=doc['meshes'][0]['primitives'][0];attrs=p['attributes'];positions=adapter.accessor(doc,blob,attrs['POSITION']);normals=adapter.accessor(doc,blob,attrs['NORMAL']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);indices=adapter.accessor(doc,blob,p['indices']).ravel()
assert all(np.isfinite(a).all() for a in [positions,normals,uv]);np.testing.assert_allclose(np.linalg.norm(normals,axis=1),1,atol=1e-4);assert uv.min()>=0 and uv.max()<=1;assert indices.min()>=0 and indices.max()<len(positions);assert len(indices)%3==0;assert 12000<len(indices)//3<20000
bounds=json.loads(subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--',str(model)],cwd=root,text=True));np.testing.assert_allclose(np.array(bounds['max'])-bounds['min'],asset['size'],atol=1e-5);assert abs(bounds['min'][1])<1e-5
material=json.loads((sample/asset['material']).read_text());checks={}
for field in ['base_color_texture','normal_texture','metallic_roughness_texture','emissive_texture']:
    image=Image.open(sample/material[field]);assert image.size==(2048,2048);pixels=np.asarray(image)[:,:,:3];assert pixels.std()>2,field;checks[field]={'size':image.size,'std':float(pixels.std())}
emission=np.asarray(Image.open(sample/material['emissive_texture']))[:,:,:3];mask=emission[:,:,1]>100;assert 100<int(mask.sum())<emission.shape[0]*emission.shape[1]*.05,'lantern emission is confined to its atlas islands';assert (emission[:,:,1][mask]>emission[:,:,0][mask]).all()
assert material['metallic']==material['roughness']==1 and material['emissive_strength']>0
report={'passed':True,'sourceLicense':'CC0-1.0','triangles':len(indices)//3,'vertices':len(positions),'nativeBounds':bounds,'atlas':checks,'emissiveTexels':int(mask.sum()),'removedInterior':manifest['model']['removedObjects']}
(root/'docs/designs/frostbound-realms/temple-import-qa.json').write_text(json.dumps(report,indent=2)+'\n');print('PASS: source/license/generated hashes, exterior geometry, native bounds, PBR atlas and localized soul-lantern emission')

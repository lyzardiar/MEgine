"""Author: MiYu. Verify source provenance, all three fortress meshes and native footprint bounds."""
import hashlib, importlib.util, json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image
mine='--mine-only' in sys.argv;crypt='--crypt-only' in sys.argv;ziggurat='--ziggurat-only' in sys.argv;root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms';manifest=json.loads((sample/('ziggurat-sources.json' if ziggurat else 'crypt-sources.json' if crypt else 'haunted-mine-sources.json' if mine else 'revenant-fortress-sources.json')).read_text());catalog=json.loads((sample/'model-catalog.json').read_text())
assert manifest['license']=='CC0-1.0'
for item in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/item['file']).read_bytes()).hexdigest()==item['sha256'],item['file']
name='Revenant-Ziggurat.txt' if ziggurat else 'Revenant-Crypt.txt' if crypt else 'Haunted-Mine.txt' if mine else 'Revenant-Fortress.txt';license=(sample/'Assets/Licenses'/name).read_bytes();assert license==(sample/'Licenses'/name).read_bytes();assert b'rubberduck' in license and b'CC0-1.0' in license
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter);reports=[]
for key in (['RevenantLodge','RevenantTower'] if ziggurat else ['RevenantBarracks'] if crypt else ['HauntedMine'] if mine else ['RevenantHall','RevenantHall2','RevenantHall3']):
    asset=catalog[key];model=sample/asset['parts'][0]['mesh'];doc,blob=adapter.read_glb(model);assert len(doc['meshes'])==1 and len(doc['meshes'][0]['primitives'])==1
    primitive=doc['meshes'][0]['primitives'][0];attributes=primitive['attributes'];positions=adapter.accessor(doc,blob,attributes['POSITION']);normals=adapter.accessor(doc,blob,attributes['NORMAL']);uv=adapter.accessor(doc,blob,attributes['TEXCOORD_0']);indices=adapter.accessor(doc,blob,primitive['indices']).ravel()
    assert all(np.isfinite(a).all() for a in [positions,normals,uv]);assert indices.min()>=0 and indices.max()<len(positions);assert uv.min()>=0 and uv.max()<=1;np.testing.assert_allclose(np.linalg.norm(normals,axis=1),1,atol=1e-4);assert len(indices)//3==manifest['models'][key]['triangles'] and 2000<len(indices)//3<12000
    bounds=json.loads(subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--',str(model)],cwd=root,text=True));np.testing.assert_allclose(np.array(bounds['max'])-bounds['min'],asset['size'],atol=1e-5);assert abs(bounds['min'][1])<1e-5
    material=json.loads((sample/asset['material']).read_text())
    for field in ['base_color_texture','normal_texture','metallic_roughness_texture','emissive_texture']:
        image=Image.open(sample/material[field]);assert image.size==(2048,2048);pixels=np.asarray(image)[:,:,:3];assert pixels.std()>2
    emission=np.asarray(Image.open(sample/material['emissive_texture']))[:,:,:3];mask=emission[:,:,1]>80;assert 100<int(mask.sum())<2048*2048*.08;assert (emission[:,:,1][mask]>emission[:,:,0][mask]).all()
    reports.append({'model':key,'triangles':len(indices)//3,'vertices':len(positions),'bounds':bounds,'emissiveTexels':int(mask.sum())})
if not mine and not crypt and not ziggurat:assert reports[0]['bounds']['max'][1]<reports[1]['bounds']['max'][1]<reports[2]['bounds']['max'][1]
if ziggurat:assert reports[1]['bounds']['max'][1]>reports[0]['bounds']['max'][1]
assert len({tuple(catalog[r['model']]['size'][i] for i in [0,2]) for r in reports})==1
(root/('docs/designs/frostbound-realms/ziggurat-import-qa.json' if ziggurat else 'docs/designs/frostbound-realms/crypt-import-qa.json' if crypt else 'docs/designs/frostbound-realms/haunted-mine-import-qa.json' if mine else 'docs/designs/frostbound-realms/revenant-fortress-import-qa.json')).write_text(json.dumps({'passed':True,'models':reports},indent=2)+'\n');print('PASS: source-pinned stone models, native bounds/footprints, finite geometry, PBR textures and localized emission')

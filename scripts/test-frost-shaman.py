"""Author: MiYu. Verify orc shaman provenance, garment assembly, skinning and native poses."""
import hashlib, importlib.util, json, subprocess
from pathlib import Path
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'shaman-sources.json').read_text());asset=json.loads((sample/'model-catalog.json').read_text())['RealShaman']
for entry in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
assert manifest['license']=='CC-BY-SA-4.0';license=(sample/'Assets/Licenses/Orc-Shaman.txt').read_text();assert all(s in license for s in ['GuieA_7','Wildfire Games','CC-BY-SA-4.0','CC-BY-SA-3.0','unit-portraits.png'])
prepared,pblob=adapter.read_glb(sample/'SourceAssets/shaman/body.glb');pattrs=prepared['meshes'][0]['primitives'][0]['attributes'];puv=adapter.accessor(prepared,pblob,pattrs['TEXCOORD_0']);pjoints=adapter.accessor(prepared,pblob,pattrs['JOINTS_0']);pweights=adapter.accessor(prepared,pblob,pattrs['WEIGHTS_0'])
names=np.array([prepared['nodes'][i]['name'] for i in prepared['skins'][0]['joints']]);dominant=names[pjoints[np.arange(len(pweights)),pweights.argmax(axis=1)].astype(int)];garment=(puv[:,0]<.5)&(puv[:,1]>.5);bones=(puv[:,0]>.5)&(puv[:,1]>.5)
assert garment.any() and bones.any();assert not any(n in {'head','neck','hand_L','hand_R','finger_L','finger_R','fingertip_L','fingertip_R'} for n in dominant[garment])
assert np.count_nonzero(bones&(dominant=='head'))>100,'retained orc face geometry'
assert all(np.count_nonzero(bones&(dominant==name))>5 for name in ['hand_L','hand_R']),'retained textured orc hands'

doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh']);assert len(doc['meshes'])==len(doc['skins'])==1
p=doc['meshes'][0]['primitives'][0];attrs=p['attributes'];weights=adapter.accessor(doc,blob,attrs['WEIGHTS_0']);joints=adapter.accessor(doc,blob,attrs['JOINTS_0']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);positions=adapter.accessor(doc,blob,attrs['POSITION']);indices=adapter.accessor(doc,blob,p['indices']).ravel()
assert all(np.isfinite(a).all() for a in [positions,weights,uv]);assert weights.shape==(len(positions),4) and weights.min()>=0;np.testing.assert_allclose(weights.sum(axis=1),1,atol=1e-5)
assert joints.max()<len(doc['skins'][0]['joints']);assert indices.min()>=0 and indices.max()<len(positions);assert uv.min()>=-1e-6 and uv.max()<=1.000001
assert [a['name'] for a in doc['animations']]==['Idle','Walk','Staff_Attack','Death'];motion={}
for clip in doc['animations']:
    moving={doc['nodes'][c['target']['node']]['name'] for c in clip['channels'] if np.ptp(adapter.accessor(doc,blob,clip['samplers'][c['sampler']]['output']),axis=0).max()>.005};motion[clip['name']]=sorted(moving);assert moving
assert {'leg_L','leg_R'}<=set(motion['Walk']) and {'arm_L','arm_R'}<=set(motion['Staff_Attack'])
references=[str(sample/asset['parts'][0]['mesh'])+f'#pose={i}:{frame}' for i,clip in enumerate(asset['animations']) for frame in range(clip['frames'])]
output=subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--',*references],cwd=root,text=True);bounds=[json.loads(line) for line in output.splitlines()];assert len(bounds)==len(references)
for b in bounds:
    low=np.array(b['min']);high=np.array(b['max']);assert np.isfinite(low).all() and np.isfinite(high).all();assert -.08<low[1]<.12 and max(high-low)<6,b
assert bounds[-1]['max'][1]<1.2 and bounds[-1]['max'][0]-bounds[-1]['min'][0]>3,'corpse lies horizontally on ground'
material=json.loads((sample/asset['material']).read_text())
for channel in ['base_color_texture','normal_texture','metallic_roughness_texture']:
    assert Image.open(sample/material[channel]).size==(1024,1024)
report={'passed':True,'sourceFiles':len(manifest['sources']),'generatedFiles':len(manifest['generated']),'triangles':len(indices)//3,'bones':len(doc['skins'][0]['joints']),'orcHeadVertices':int(np.count_nonzero(bones&(dominant=='head'))),'nativeSamples':len(bounds),'movingBones':motion,'bounds':bounds}
(root/'docs/designs/frostbound-realms/shaman-import-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: orc face/hands and garment separation, staff, source/license hashes, skin weights, textures and every native pose')

"""Author: MiYu. Check anatomical skeleton-warrior provenance, skinning and all native poses."""
import hashlib, importlib.util, json, subprocess
from pathlib import Path
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'skeleton-warrior-sources.json').read_text());catalog=json.loads((sample/'model-catalog.json').read_text());report={'passed':True,'variants':{}}
for entry in manifest['sources']+manifest['inputs']+manifest['generated']:assert hashlib.sha256((sample/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
assert manifest['license']=='CC-BY-SA-3.0'
license=(sample/'Assets/Licenses/Anatomical-Skeleton-Warrior.txt').read_text();assert all(s in license for s in ['Gord Goodwin','Wildfire Games','CC0-1.0','CC-BY-SA-3.0','unit-portraits.png'])
for key in ['RealSkeletonWarrior']:
    asset=catalog[key];doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh']);assert len(doc['meshes'])==len(doc['skins'])==1
    p=doc['meshes'][0]['primitives'][0];attrs=p['attributes'];weights=adapter.accessor(doc,blob,attrs['WEIGHTS_0']);joints=adapter.accessor(doc,blob,attrs['JOINTS_0']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);positions=adapter.accessor(doc,blob,attrs['POSITION']);indices=adapter.accessor(doc,blob,p['indices']).ravel()
    assert all(np.isfinite(a).all() for a in [positions,weights,uv]);assert weights.shape==(len(positions),4) and weights.min()>=0;np.testing.assert_allclose(weights.sum(axis=1),1,atol=1e-5)
    assert joints.max()<len(doc['skins'][0]['joints']);assert indices.min()>=0 and indices.max()<len(positions);assert uv.min()>=-1e-6 and uv.max()<=1.000001
    assert [a['name'] for a in doc['animations']]==['Idle','Walk','Sword_Attack','Death'];motion={}
    for i,clip in enumerate(doc['animations']):
        moving={doc['nodes'][c['target']['node']]['name'] for c in clip['channels'] if np.ptp(adapter.accessor(doc,blob,clip['samplers'][c['sampler']]['output']),axis=0).max()>.005};motion[clip['name']]=sorted(moving);assert moving
        if i==1:assert {'FEMUR.L','FEMUR.R'}<=moving
        if i==2:assert {'HAND.R','prop-weapon_R','prop-shield'}<=moving
    references=[str(sample/asset['parts'][0]['mesh'])+f'#pose={i}:{frame}' for i,clip in enumerate(asset['animations']) for frame in range(clip['frames'])]
    output=subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--',*references],cwd=root,text=True);bounds=[json.loads(line) for line in output.splitlines()];assert len(bounds)==len(references)
    for b in bounds:
        low=np.array(b['min']);high=np.array(b['max']);assert np.isfinite(low).all() and np.isfinite(high).all();assert -.06<low[1]<.07 and max(high-low)<5,b
    np.testing.assert_allclose(np.array(bounds[0]['max'])-bounds[0]['min'],asset['size'],atol=.15)
    assert bounds[-1]['max'][1]<1.4,'corpse lies on ground'
    report['variants'][key]={'triangles':len(indices)//3,'bones':len(doc['skins'][0]['joints']),'nativeSamples':len(bounds),'movingBones':motion,'bounds':bounds}
image=Image.open(sample/'Assets/Textures/RealSkeletonWarrior_base.png');assert image.size==(2048,1024)
pixels=np.asarray(image);assert all(pixels[:,a:b,:3].std()>4 for a,b in [(0,1024),(1024,1536),(1536,2048)])
(root/'docs/designs/frostbound-realms/skeleton-warrior-import-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: source/license/input hashes, sword/shield geometry, skinning, melee animation, every native pose and grounded death')

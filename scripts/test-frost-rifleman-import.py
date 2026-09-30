"""Author: MiYu. Verify rifleman skinning, two-handed gun attachment and native sampled poses."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import numpy as np

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'rifleman-sources.json').read_text());catalog=json.loads((sample/'model-catalog.json').read_text());report={'passed':True,'models':{},'sourceFiles':len(manifest['sources']),'generatedFiles':len(manifest['generated'])}
for entry in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
for key,definition in manifest['models'].items():
    asset=catalog[key];doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh']);primitive=doc['meshes'][0]['primitives'][0];attrs=primitive['attributes'];points=adapter.accessor(doc,blob,attrs['POSITION']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);weights=adapter.accessor(doc,blob,attrs['WEIGHTS_0']);joints=adapter.accessor(doc,blob,attrs['JOINTS_0']);indices=adapter.accessor(doc,blob,primitive['indices']).ravel()
    assert len(doc['skins'])==1 and all(np.isfinite(a).all() for a in [points,uv,weights]);assert weights.shape==(len(points),4) and weights.min()>=0;np.testing.assert_allclose(weights.sum(axis=1),1,atol=1e-5)
    assert indices.min()>=0 and indices.max()<len(points) and len(indices)%3==0;assert joints.max()<len(doc['skins'][0]['joints']);assert uv.min()>=0 and uv.max()<=1
    names=[doc['nodes'][node]['name'] for node in doc['skins'][0]['joints']]
    def mask(bones):return np.sum(np.where(np.isin(joints,[names.index(n) for n in bones]),weights,0),axis=1)>.5
    groups={'gun':mask(['prop-weapon_R']),'left':mask(['hand_L','finger_L','fingertip_L']),'right':mask(['hand_R','finger_R','fingertip_R']),'cape':mask(['cape1','cape2','cape3'])};assert all(m.sum()>10 for m in groups.values())
    assert [a['name'] for a in doc['animations']]==list(definition['animations']);references=[];motion={}
    for index,clip in enumerate(doc['animations']):
        moving={doc['nodes'][c['target']['node']]['name'] for c in clip['channels'] if np.ptp(adapter.accessor(doc,blob,clip['samplers'][c['sampler']]['output']),axis=0).max()>.01};motion[clip['name']]=sorted(moving)
        if index==1:assert any(n.startswith('cape') for n in moving)
        if index==2:assert 'arm_R' in moving
        for frame in range(asset['animations'][index]['frames']):references.append(str(sample/asset['parts'][0]['mesh'])+f'#pose={index}:{frame}')
    output=subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--','--positions',*references],cwd=root,text=True)
    bounds=[];grip=[];support=[];muzzle_gap=None
    for line in output.splitlines():
        result=json.loads(line);posed=np.array(result.pop('positions'));assert len(posed)==len(points) and np.isfinite(posed).all();low=np.array(result['min']);high=np.array(result['max']);assert 2<high[1]-low[1]<4.5 and np.max(high-low)<5 and -.5<low[1]<.5,result
        def gap(a,b):return float(np.linalg.norm(posed[groups[a]][:,None,:]-posed[groups[b]][None,:,:],axis=2).min())
        distance=gap('gun','right');assert distance<.2,(result['mesh'],'trigger hand',distance);grip.append(distance)
        distance=gap('gun','left');assert distance<.3,(result['mesh'],'support hand',distance);support.append(distance)
        if result['mesh'].endswith('#pose=2:'+str(int(asset['attackEvent']*asset['animations'][2]['frames']))):
            muzzle_gap=float(np.linalg.norm(posed[groups['gun']]-np.array(asset['muzzle']),axis=1).min());assert muzzle_gap<.08,('muzzle attachment',muzzle_gap)
        bounds.append(result)
    report['models'][key]={'triangles':len(indices)//3,'bones':len(names),'nativePoses':len(bounds),'maximumTriggerHandGap':max(grip),'maximumSupportHandGap':max(support),'muzzle':asset['muzzle'],'muzzleVertexGap':muzzle_gap,'movingBones':motion,'bounds':bounds}
(root/'docs/designs/frostbound-realms/rifleman-import-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: rifleman source/generated hashes, gun/hand grip, animated cape and',sum(v['nativePoses'] for v in report['models'].values()),'native poses')

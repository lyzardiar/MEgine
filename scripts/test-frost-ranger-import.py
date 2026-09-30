"""Author: MiYu. Verify ranger skinning, bow deformation, attachments and native sampled poses."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import numpy as np

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
manifest=json.loads((sample/'ranger-sources.json').read_text());catalog=json.loads((sample/'model-catalog.json').read_text());report={'passed':True,'models':{},'sourceFiles':len(manifest['sources']),'generatedFiles':len(manifest['generated'])}
for entry in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
for key,definition in manifest['models'].items():
    asset=catalog[key];doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh']);primitive=doc['meshes'][0]['primitives'][0];attrs=primitive['attributes'];points=adapter.accessor(doc,blob,attrs['POSITION']);uv=adapter.accessor(doc,blob,attrs['TEXCOORD_0']);weights=adapter.accessor(doc,blob,attrs['WEIGHTS_0']);joints=adapter.accessor(doc,blob,attrs['JOINTS_0']);indices=adapter.accessor(doc,blob,primitive['indices']).ravel()
    assert len(doc['skins'])==1 and all(np.isfinite(a).all() for a in [points,uv,weights]);assert weights.shape==(len(points),4) and weights.min()>=0;np.testing.assert_allclose(weights.sum(axis=1),1,atol=1e-5)
    assert indices.min()>=0 and indices.max()<len(points) and len(indices)%3==0;assert joints.max()<len(doc['skins'][0]['joints']);assert uv.min()>=0 and uv.max()<=1
    names=[doc['nodes'][node]['name'] for node in doc['skins'][0]['joints']]
    def mask(bones):return np.sum(np.where(np.isin(joints,[names.index(n) for n in bones]),weights,0),axis=1)>.5
    groups={'bow':mask(['Bow_Root','Bow_String','Bow_Branch_Top','Bow_Branch_Bot']),'left':mask(['hand_L','finger_L','fingertip_L']),'right':mask(['hand_R','finger_R','fingertip_R']),'cape':mask(['cape1','cape2','cape3'])};assert all(m.sum()>10 for m in groups.values())
    if key.endswith('Loaded'):groups['arrow']=mask(['prop-projectile']);assert groups['arrow'].sum()>10
    elif not key.endswith('Shoot'):groups['arrow']=mask(['prop-weapon_R']);assert groups['arrow'].sum()>10
    assert [a['name'] for a in doc['animations']]==list(definition['animations']);references=[];motion={}
    for index,clip in enumerate(doc['animations']):
        moving={doc['nodes'][c['target']['node']]['name'] for c in clip['channels'] if np.ptp(adapter.accessor(doc,blob,clip['samplers'][c['sampler']]['output']),axis=0).max()>.01};motion[clip['name']]=sorted(moving)
        if index==1:assert any(n.startswith('cape') for n in moving),'cape follows running'
        if index>=2:assert 'Bow_String' in moving and 'arm_R' in moving,'bow and archer move together'
        for frame in range(asset['animations'][index]['frames']):references.append(str(sample/asset['parts'][0]['mesh'])+f'#pose={index}:{frame}')
    output=subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--','--positions',*references],cwd=root,text=True)
    bounds=[];grip=[];arrows=[]
    for line in output.splitlines():
        result=json.loads(line);posed=np.array(result.pop('positions'));assert len(posed)==len(points) and np.isfinite(posed).all();low=np.array(result['min']);high=np.array(result['max']);assert 2<high[1]-low[1]<4.5 and np.max(high-low)<5 and -.5<low[1]<.5,result
        def gap(a,b):return float(np.linalg.norm(posed[groups[a]][:,None,:]-posed[groups[b]][None,:,:],axis=2).min())
        distance=gap('bow','left');assert distance<.2,(key,result['mesh'],'bow grip',distance);grip.append(distance)
        clip,frame=map(int,result['mesh'].split('#pose=')[1].split(':'));phase=frame/asset['animations'][clip]['frames']
        if 'arrow' in groups and (not key.endswith('Loaded') or clip>=2 and (phase<asset['attackEvent'] or phase>=asset['ammoLoad'])):
            distance=gap('arrow','right');assert distance<.25,(key,result['mesh'],'arrow grip',distance);arrows.append(distance)
        bounds.append(result)
    report['models'][key]={'triangles':len(indices)//3,'bones':len(names),'nativePoses':len(bounds),'maximumBowGripGap':max(grip),'maximumArrowGripGap':max(arrows) if arrows else None,'weightedCapeVertices':int(groups['cape'].sum()),'movingBones':motion,'bounds':bounds}
(root/'docs/designs/frostbound-realms/ranger-import-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: ranger source/generated hashes, animated cape/bow, bow/arrow grip and',sum(v['nativePoses'] for v in report['models'].values()),'native poses')

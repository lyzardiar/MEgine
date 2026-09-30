"""Author: MiYu. Validate authored falls through MEngine's native skinning path."""
import importlib.util
import json
import subprocess
from pathlib import Path
import numpy as np

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms';catalog=json.loads((sample/'model-catalog.json').read_text())
spec=importlib.util.spec_from_file_location('adapter',root/'scripts/import-ion-assets.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
report={'passed':True,'models':{}}
for key in ['RealFootman','RealWorker','RealArcher','RealKnight','RealPaladin','RealDawnPaladin','RealFrostWarden','RealEmberSage','RealSylvanRanger','RealRifleman']:
    asset=catalog[key];index=next(i for i,a in enumerate(asset['animations']) if a['name']=='Death');frames=asset['animations'][index]['frames'];doc,blob=adapter.read_glb(sample/asset['parts'][0]['mesh']);primitive=doc['meshes'][0]['primitives'][0];attrs=primitive['attributes'];weights=adapter.accessor(doc,blob,attrs['WEIGHTS_0']);joints=adapter.accessor(doc,blob,attrs['JOINTS_0']);names=[doc['nodes'][n]['name'] for n in doc['skins'][0]['joints']]
    head=names.index('rider_prop-head' if key=='RealKnight' else 'prop-head');mask=np.sum(np.where(joints==head,weights,0),axis=1)>.5;assert mask.sum()>20
    refs=[str(sample/asset['parts'][0]['mesh'])+f'#pose={index}:{frame}' for frame in range(frames)];output=subprocess.check_output(['cargo','run','-q','-p','mengine-assets','--example','gltf_bounds','--','--positions',*refs],cwd=root,text=True);heads=[];bounds=[]
    for line in output.splitlines():
        result=json.loads(line);points=np.array(result.pop('positions'));assert len(points)==len(weights) and np.isfinite(points).all() and np.abs(points).max()<12
        heads.append(float(points[mask,1].mean()));bounds.append(result)
    assert len(bounds)==frames and heads[-1]<heads[0]*.6,(key,heads)
    assert -.15<heads[-1]<1.5,(key,heads[-1])
    report['models'][key]={'frames':frames,'headHeightStart':heads[0],'headHeightEnd':heads[-1],'minimumMeshY':min(v['min'][1] for v in bounds),'maximumMeshY':max(v['max'][1] for v in bounds),'bounds':bounds}
(root/'docs/designs/frostbound-realms/death-import-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS:',len(report['models']),'authored falls,',sum(v['frames'] for v in report['models'].values()),'native poses, finite geometry and fallen head positions')

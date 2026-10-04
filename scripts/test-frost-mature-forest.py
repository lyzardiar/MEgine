"""Author: MiYu. Validate shared-pivot forest LODs, repeating bark UVs and source canopy retention."""
import hashlib,json,struct
from pathlib import Path
import numpy as np
from PIL import Image

sample=Path(__file__).resolve().parents[1]/'samples/frostbound-realms';manifest=json.loads((sample/'realistic-sources.json').read_text(encoding='utf-8'));catalog=json.loads((sample/'model-catalog.json').read_text(encoding='utf-8'));asset=catalog['RealJacaranda'];recipe=next(a for a in manifest['assets'] if a['id']=='jacaranda_tree')
assert recipe['separate_materials'] and recipe['page']=='https://polyhaven.com/a/jacaranda_tree';assert manifest['license']=='CC0-1.0'
for e in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/e['file']).read_bytes()).hexdigest()==e['sha256'],e['file']
source=sample/'SourceAssets/polyhaven/jacaranda_tree/textures';alpha=np.asarray(Image.open(source/'jacaranda_tree_leaves_alpha_1k.png').convert('L'));color=np.asarray(Image.open(source/'jacaranda_tree_leaves_diff_1k.png').convert('RGB'));atlas=np.asarray(Image.open(sample/'Assets/Textures/Real_jacaranda_tree_leaves_base.png'));np.testing.assert_array_equal(atlas[:,:,3],alpha);np.testing.assert_array_equal(atlas[alpha>=128,:3],color[alpha>=128]);assert alpha.min()==0 and alpha.max()==255
report=[]
for lod,parts in enumerate(asset['lod_parts']):
 assert len(parts)==3 and asset['lods'][lod]==parts[0]['mesh'];points=[];stats=[]
 for part in parts:
  assert part['pivot']==[0,0,0];raw=(sample/part['mesh']).read_bytes();assert raw[:4]==b'glTF';size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);blob=raw[28+size:];primitive=doc['meshes'][0]['primitives'][0]
  def read(accessor,width,dtype):
   a=doc['accessors'][accessor];view=doc['bufferViews'][a['bufferView']];return np.frombuffer(blob,dtype=dtype,count=a['count']*width,offset=view.get('byteOffset',0)+a.get('byteOffset',0)).reshape((-1,width))
  p=read(primitive['attributes']['POSITION'],3,'<f4');n=read(primitive['attributes']['NORMAL'],3,'<f4');uv=read(primitive['attributes']['TEXCOORD_0'],2,'<f4');indices=read(primitive['indices'],1,'<u4').reshape((-1,3));assert np.isfinite(p).all() and np.isfinite(uv).all();np.testing.assert_allclose(np.linalg.norm(n,axis=1),1,atol=1e-4)
  material=json.loads((sample/part['material']).read_text());assert material['double_sided'];assert Image.open(sample/material['base_color_texture']).size==(1024,1024);assert part['material']==asset['lod_parts'][0][len(stats)]['material']
  if part['name']=='leaves':
   assert material['surface']=='cutout' and material['alpha_cutoff']==.3;tri=p[indices];area=float(np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1).sum()/2);assert area>=2474.918206*[.85,.75][lod],('retained authored leaf area',lod,area)
  else:
   assert material.get('surface','opaque')=='opaque';area=None
  if part['name']=='branches':assert uv[:,1].min()<-100 and uv[:,0].min()<0,'authored bark repetitions retained'
  points.append(p);stats.append({'name':part['name'],'triangles':len(indices),'leafArea':area})
 all_points=np.concatenate(points);bounds=np.ptp(all_points,axis=0);assert abs(all_points[:,1].min())<.02 and abs((all_points[:,0].min()+all_points[:,0].max())/2)<.02 and abs((all_points[:,2].min()+all_points[:,2].max())/2)<.02
 assert sum(s['triangles'] for s in stats)<=recipe['triangles'][lod];assert sum(s['triangles'] for s in stats)==manifest['models']['RealJacaranda']['lods'][lod]['triangles']
 if lod==0:np.testing.assert_allclose(bounds,asset['size'],atol=1e-4)
 else:np.testing.assert_allclose(bounds,asset['size'],rtol=.02,atol=.02)
 report.append({'parts':stats,'bounds':bounds.tolist()})
assert sum(p['triangles'] for p in report[1]['parts'])<sum(p['triangles'] for p in report[0]['parts']);assert report[1]['parts'][2]['leafArea']/report[0]['parts'][2]['leafArea']>.85
print(json.dumps({'passed':True,'model':'RealJacaranda','lods':report,'sourceHashes':len(manifest['sources']),'derivedHashes':len(manifest['generated']),'sharedPivot':True,'repeatUvs':True,'sourceLeafAlphaAndVisibleColor':True}))

"""Author: MiYu. Verify pinned biome sources, foliage alpha and real 3D LOD geometry."""
import hashlib,json,struct
from pathlib import Path
import numpy as np
from PIL import Image

sample=Path(__file__).resolve().parents[1]/'samples/frostbound-realms';manifest=json.loads((sample/'realistic-sources.json').read_text(encoding='utf-8'));catalog=json.loads((sample/'model-catalog.json').read_text(encoding='utf-8'))
for entry in manifest['sources']+manifest['generated']:assert hashlib.sha256((sample/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
source_alpha=np.asarray(Image.open(sample/'SourceAssets/polyhaven/tree_small_02/textures/tree_small_02_leaves_alpha_1k.png'));assert source_alpha.dtype==np.uint16
alpha=np.rint(source_alpha.astype(np.float64)*255/65535).astype(np.uint8);color=np.asarray(Image.open(sample/'SourceAssets/polyhaven/tree_small_02/textures/tree_small_02_leaves_diff_1k.png').convert('RGB'));atlas=np.asarray(Image.open(sample/'Assets/Textures/Real_tree_small_02_base.png'))
panels=[i for i in range(atlas.shape[1]//1024) if np.array_equal(atlas[:1024,i*1024:(i+1)*1024,3],alpha)];assert panels
for row in range(atlas.shape[0]//1024):
 for col in panels:
  panel=atlas[row*1024:(row+1)*1024,col*1024:(col+1)*1024];np.testing.assert_array_equal(panel[:,:,3],alpha);np.testing.assert_array_equal(panel[alpha>=128,:3],color[alpha>=128])
assert alpha.min()==0 and alpha.max()==255
report={}
for name,limits in [('RealBroadleaf',[55000,42000]),('RealQuiver',[12000,4000])]:
 art=catalog[name];bounds=[];stats=[];leaf_areas=[]
 for index,path in enumerate(art['lods']):
  raw=(sample/path).read_bytes();assert raw[:4]==b'glTF';size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);blob=raw[28+size:];primitive=doc['meshes'][0]['primitives'][0]
  def read(key,width):
   accessor=doc['accessors'][primitive['attributes'][key]];view=doc['bufferViews'][accessor['bufferView']];return np.frombuffer(blob,dtype='<f4',count=accessor['count']*width,offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)).reshape((-1,width))
  positions=read('POSITION',3);normals=read('NORMAL',3);uv=read('TEXCOORD_0',2);triangles=doc['accessors'][primitive['indices']]['count']//3;assert 100<triangles<=limits[index]
  assert np.isfinite(positions).all() and np.isfinite(uv).all();np.testing.assert_allclose(np.linalg.norm(normals,axis=1),1,atol=1e-4);assert np.ptp(positions,axis=0).min()>.5
  bounds.append(np.ptp(positions,axis=0));assert abs(positions[:,1].min())<.02
  if name=='RealBroadleaf':
   accessor=doc['accessors'][primitive['indices']];view=doc['bufferViews'][accessor['bufferView']];indices=np.frombuffer(blob,dtype='<u4',count=accessor['count'],offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)).reshape((-1,3))
   leaves=((uv[:,0]>=min(panels)/(atlas.shape[1]/1024)-1e-6)&(uv[:,0]<=(max(panels)+1)/(atlas.shape[1]/1024)+1e-6))[indices].all(axis=1);points=positions[indices[leaves]]
   leaf_areas.append(float(np.linalg.norm(np.cross(points[:,1]-points[:,0],points[:,2]-points[:,0]),axis=1).sum()/2));assert leaves.sum()>100,'LOD retains leaf geometry'
  assert triangles==manifest['models'][name]['lods'][index]['triangles'];stats.append(triangles)
 assert stats[1]<stats[0];assert (bounds[1]/bounds[0]>.85).all()
 if leaf_areas:assert min(leaf_areas)>8 and leaf_areas[1]/leaf_areas[0]>.75,('both LODs preserve crown area',leaf_areas)
 report[name]={'triangles':stats,'nearBounds':bounds[0].tolist(),'farBounds':bounds[1].tolist(),'leafAreas':leaf_areas}
material=json.loads((sample/'Assets/Materials/Real_tree_small_02.mmat').read_text());assert material['surface']=='cutout' and material['double_sided']
print(json.dumps({'passed':True,'sourceHashes':len(manifest['sources']),'derivedHashes':len(manifest['generated']),'exactLeafAlphaAndVisibleColor':True,'models':report}))

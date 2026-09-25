"""Prepare only source collider sprite copies and cells in an isolated Unity project."""
import sys,json,shutil
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from unity_tile_source import UnityTiles,documents
if len(sys.argv) != 3: raise SystemExit('Usage: python scripts/prepare-unity-isometric-probe.py SOURCE_CHECKOUT ISOLATED_UNITY_PROJECT')
project=Path(sys.argv[2]).resolve()
if (project/'Temp/UnityLockfile').exists(): raise SystemExit('Probe project is open; reuse that Editor instead of starting another.')
s=UnityTiles(sys.argv[1],project)
d=documents(s.source/'Assets/Tilemap/IsometricZAsY/Scenes/Scene_Biome_Desert_ZAsY.unity')
out=project/'Assets/IsoSprites';out.mkdir(exist_ok=True)
maps=[]
for key,doc in d.items():
 if 'Tilemap' not in doc:continue
 t=doc['Tilemap']; go=t['m_GameObject']['fileID'];name=d[go]['GameObject']['m_Name']
 if 'Collider' not in name:continue
 parts={next(iter(v)):next(iter(v.values())) for v in d.values() if next(iter(v.values())).get('m_GameObject',{}).get('fileID')==go}
 co=parts['CompositeCollider2D'];m=dict(name=name,composite=parts['TilemapCollider2D']['m_CompositeOperation']==1,radius=co['m_EdgeRadius'],vertexDistance=co['m_VertexDistance'],offsetDistance=co['m_OffsetDistance'],anchor=t['m_TileAnchor'],cells=[])
 for cell in t['m_Tiles']:
  c=cell['second'];ref=t['m_TileSpriteArray'][c['m_TileSpriteIndex']]['m_Data'];p=s.paths[ref['guid']]
  for ext in ('','.meta'):shutil.copyfile(str(p)+ext,str(out/p.name)+ext)
  mat=t['m_TileMatrixArray'][c['m_TileMatrixIndex']]['m_Data']
  assert all(mat[f'e{i}{j}']==(mat[f'e{i}{i}'] if i==j else 0) for i in range(4) for j in range(4))
  m['cells'].append(dict(cell=cell['first'],sprite='Assets/IsoSprites/'+p.name,scale=dict(x=mat['e00'],y=mat['e11'],z=mat['e22'])))
 maps.append(m)
(project/'isometric-input.json').write_text(json.dumps(dict(maps=maps)))
p=project/'Packages/manifest.json';p.parent.mkdir(exist_ok=True)
v=json.loads(p.read_text()) if p.exists() else dict(dependencies={})
for module in ['tilemap','jsonserialize','physics2d']:v['dependencies']['com.unity.modules.'+module]='1.0.0'
p.write_text(json.dumps(v))
editor=project/'Assets/Editor';editor.mkdir(exist_ok=True)
shutil.copyfile(Path(__file__).parent/'unity-probes/IsometricColliderProbe.cs',editor/'IsometricColliderProbe.cs')
print([(m['name'],len(m['cells']),m['composite']) for m in maps])

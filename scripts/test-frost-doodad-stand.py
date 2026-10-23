"""Author: MiYu. Generate a small real-map fixture covering initial weighted Stand choices."""
import argparse
import copy
import ctypes
import importlib
import json
from pathlib import Path
import tempfile
from warcraft_map import load_map
from warcraft_doodads import encode_doodads
from warcraft_mpq_writer import build_archive

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--game',type=Path,default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
args=parser.parse_args()
data,members=load_map(args.game/'Maps/FrozenThrone/(2)Amazonia.w3x')
parent=ROOT/'tmp/docs-artifacts/warcraft-map-tests';parent.mkdir(parents=True,exist_ok=True)
output=Path(tempfile.mkdtemp(prefix='stand-fixture-',dir=parent))
original=copy.deepcopy(data['doodads']);original['doodads']=[];original['terrainDoodads']=[]
for object_id in ['LOgr','AWfs','NWrw']:
    source=next(d for d in data['doodads']['doodads'] if d['id']==object_id)
    for index in range(8):
        placement=copy.deepcopy(source);x,y,z=source['location']
        placement.update(editorId=len(original['doodads']),location=[x+(index%4)*256,y+(index//4)*256,z])
        original['doodads'].append(placement)
members['war3map.doo']=encode_doodads(original)
fixture=output/'stand-fixture.w3x';fixture.write_bytes(build_archive(members))
export=output/'export';importlib.import_module('import-frost-original-map').export_map(fixture,export)
project=output/'project';builder=importlib.import_module('build-frost-original-doodads')
receipt=builder.build(export,args.game,project,ROOT/'tmp/warcraft-effects/sentinel-bin/MdxExport.dll',ROOT/'tmp/warcraft-effects/node-metadata/NodeMetadata.dll',1)
placements=json.loads((project/'doodad-placements.json').read_bytes())
entities={e['name']:e for e in json.loads((project/'Assets/Scenes/Main.mscene').read_bytes())['world']['entities']}
models={m['source']:m for m in receipt['models']}
script=(project/'Assets/Scripts/Main.js').read_text(encoding='utf-8')
groups=json.loads(script.split('var originalDoodadGroups=',1)[1].split(';\n',1)[0])
# Explicit source candidate indices/weights, independent of the production ranking and rarity reader.
choices={'LOgr':[(0,25),(1,100)],'AWfs':[(0,100),(1,100),(2,6)],'NWrw':[(0,100),(2,12),(3,12)]}
crt=ctypes.CDLL('C:/Windows/System32/msvcr120.dll');crt.srand(1);crt.rand.restype=ctypes.c_int
checked=[]
assert len(placements)==24 and receipt['animationSeed']==1
for placement in placements:
    options=choices[placement['source']['id']];roll=1+crt.rand()%(sum(weight for _,weight in options)-1)
    accumulated=0
    for expected,weight in options:
        accumulated+=weight
        if roll<=accumulated:break
    assert placement['animation']==dict(clip=expected,held=False)
    for name in placement['parts']:
        mesh=entities[name]['components']['MeshRenderer']['mesh']
        assert mesh.endswith(f'#pose={expected}:0')
        for group in groups:
            if name in group['names']:assert group['clip']==expected
    checked.append(dict(name=placement['name'],id=placement['source']['id'],clip=expected,clipName=models[placement['model']]['clips'][expected]['name']))
assert len({row['clip'] for row in checked if row['id']=='LOgr'})==2
result=dict(sourceMapSha256=data['source']['sha256'],project=str(project),seed=1,checked=checked,passed=True)
(output/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))

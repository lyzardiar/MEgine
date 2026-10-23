"""Author: MiYu. Generate a source-derived fixture and verify life-dependent clips and flags dispatch."""
import argparse
import copy
import importlib
import json
from pathlib import Path
import tempfile
from warcraft_map import load_map
from warcraft_doodads import encode_doodads
from warcraft_mpq_writer import build_archive
from warcraft_mpq import mpyq, read_archive

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--game',type=Path,default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
args=parser.parse_args()
data,members=load_map(args.game/'Maps/(2)BootyBay.w3m')
source=ROOT/'tmp/docs-artifacts/warcraft-map-tests'
source.mkdir(parents=True,exist_ok=True)
output=Path(tempfile.mkdtemp(prefix='life-fixture-',dir=source))
original=copy.deepcopy(data['doodads'])
tree=next(d for d in original['doodads'] if d['id']=='LTlt')
# The source WindMill has both Stand and Death clips, so a wrong category silently renders the wrong state.
rows=importlib.import_module('import-frost-wisp-rules').rows
for archive_name in ['War3Patch.mpq','War3xLocal.mpq','War3x.mpq','war3.mpq']:
    archive=mpyq.MPQArchive(str(args.game/archive_name),listfile=False)
    try:
        definitions=rows(read_archive(archive,'Doodads\\Doodads.slk'));break
    except FileNotFoundError:pass
    finally:archive.file.close()
else:raise FileNotFoundError('Original Doodads.slk')
windmill=next(d for d in original['doodads'] if 'WindMill' in definitions.get(d['id'],{}).get('file',''))
cases=[(windmill,0,2,'stand','decorative'),(tree,0,2,'death','destructable'),(tree,100,2,'stand','destructable'),
       (windmill,0,0,'stand','decorative'),(tree,100,1,'stand','decorative'),(tree,100,0,'stand','suppressed'),
       (tree,100,4,'stand','suppressed'),(windmill,255,1,'stand','decorative')]
original['doodads']=[]
for index,(source,life,flags,clip,kind) in enumerate(cases):
    d=copy.deepcopy(source);x,y,z=windmill['location']
    d.update(life=life,flags=flags,editorId=index,location=[x+index%4*640,y+index//4*640,z]);original['doodads'].append(d)
original['terrainDoodads']=[]
members['war3map.doo']=encode_doodads(original)
fixture=output/'life-fixture.w3m';fixture.write_bytes(build_archive(members))
export=output/'export'
importlib.import_module('import-frost-original-map').export_map(fixture,export)
builder=importlib.import_module('build-frost-original-doodads')
project=output/'project'
receipt=builder.build(export,args.game,project,ROOT/'tmp/warcraft-effects/sentinel-bin/MdxExport.dll',ROOT/'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
placements=json.loads((project/'doodad-placements.json').read_bytes())
entities={e['name']:e for e in json.loads((project/'Assets/Scenes/Main.mscene').read_bytes())['world']['entities']}
models={m['source']:m for m in receipt['models']}
checked=[]
for placement,(_,life,flags,expected,kind) in zip(placements,cases):
    assert placement['kind']==kind
    assert entities[placement['name']]['active']==(kind!='suppressed')
    clips=models[placement['model']]['clips']
    for name in placement['parts']:
        pose=entities[name]['components']['MeshRenderer']['mesh'].split('#pose=')[1]
        clip,frame=map(int,pose.split(':'))
        assert clips[clip]['name'].lower()==expected,(name,clips[clip]['name'],expected)
        # Source sampling includes both endpoints: frameCount is the terminal sample index.
        assert frame==(clips[clip]['frameCount'] if expected=='death' else 0)
    checked.append(dict(name=placement['name'],id=placement['source']['id'],life=life,flags=flags,kind=kind,clip=expected,parts=len(placement['parts'])))
script=(project/'Assets/Scripts/Main.js').read_text(encoding='utf-8')
groups=json.loads(script.split('var originalDoodadGroups=',1)[1].split(';\n',1)[0])
assert any(name in g['names'] for g in groups for name in placements[0]['parts']),'Ordinary life=0 must retain Stand animation'
assert not any(name in g['names'] for g in groups for name in placements[1]['parts']),'Initially dead tree must remain at Death end'
result=dict(sourceMapSha256=data['source']['sha256'],project=str(project),checked=checked,passed=True)
(output/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))

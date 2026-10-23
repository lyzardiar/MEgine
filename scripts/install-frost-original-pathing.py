"""Author: MiYu. Attach source WPM data and its shared runtime to an imported map project."""
import argparse
import hashlib
import json
from pathlib import Path
from warcraft_map import load_map

ROOT=Path(__file__).resolve().parents[1]


def install(export,project):
    export,project=export.resolve(),project.resolve()
    receipt=json.loads((export/'map.json').read_bytes());original=(export/receipt['source']['preservedArchive']).resolve();original.relative_to(export)
    if hashlib.sha256(original.read_bytes()).hexdigest()!=receipt['source']['sha256']:raise ValueError('Changed original map archive')
    data,members=load_map(original);terrain=json.loads((project/'terrain-sources.json').read_bytes())
    if terrain['mapSha256']!=data['source']['sha256']:raise ValueError('Pathing export belongs to another map')
    pathing=data['pathing'];size=pathing['size']
    if size!=[v*4 for v in data['terrain']['tileSize']] or len(pathing['cells'])!=size[0]*size[1]:raise ValueError('Pathing dimensions do not match original terrain')
    if size[0]*size[1]>16777216:raise ValueError('Pathing grid exceeds the runtime cell limit')
    raw=members['war3map.wpm']
    digest=hashlib.sha256
    if digest(raw).hexdigest()!=data['source']['members']['war3map.wpm']['sha256']:raise ValueError('Changed original WPM')
    if raw[16:]!=bytes(pathing['cells']):raise ValueError('Decoded WPM cells changed')
    script_path=project/'Assets/Scripts/Main.js';script_bytes=script_path.read_bytes();script=script_bytes.decode('utf-8')
    if 'var originalMapPathing=' in script:raise ValueError('Project already has original pathing runtime')
    runs=[]
    for value in pathing['cells']:
        if runs and runs[-1]==value:runs[-2]+=1
        else:runs.extend([1,value])
    payload=dict(schema='mengine.warcraft-pathing',version=1,sourceSha256=data['source']['sha256'],size=size,origin=data['terrain']['origin'],cellWorldSize=32,runs=runs)
    runtime=ROOT/'samples/frostbound-realms/game/warcraft-pathing.js'
    encoded=json.dumps(payload,separators=(',',':'),allow_nan=False)
    assets=project/'Assets/Data';assets.mkdir(parents=True,exist_ok=True)
    (assets/'OriginalPathing.json').write_text(encoded+'\n',encoding='utf-8')
    script_path.write_text(script+'\n'+runtime.read_text(encoding='utf-8')+'\nvar originalMapPathing=FrostWarcraftPathing.create('+encoded+');\n',encoding='utf-8',newline='\n')
    receipt=dict(mapSha256=data['source']['sha256'],wpmSha256=digest(raw).hexdigest(),runtimeSha256=digest(runtime.read_bytes()).hexdigest(),installerSha256=digest(Path(__file__).read_bytes()).hexdigest(),baseScriptSha256=digest(script_bytes).hexdigest(),size=size,cells=len(pathing['cells']),runs=len(runs)//2,encodedBytes=len(encoded.encode()),asset='Assets/Data/OriginalPathing.json',coverage=dict(sourceCells=True,engineCoordinates=True,mutableBaseFlags=True,dynamicBlockers=False,unitNavigation=False,jass=False))
    (project/'pathing-sources.json').write_text(json.dumps(receipt,separators=(',',':'))+'\n',encoding='utf-8')
    return receipt


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('export',type=Path);parser.add_argument('project',type=Path);args=parser.parse_args()
    print(json.dumps(install(args.export,args.project)))

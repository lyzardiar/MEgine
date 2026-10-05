"""Author: MiYu. Hash-check all supplemental conversions and load them through the native engine."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--probe',type=Path,default=Path('D:/MEngineNativeQA/tile-build-1790939800003/release/examples/gltf_bounds.exe'))
    parser.add_argument('--library',type=Path,default=ROOT/'asset-library/warcraft-iii')
    args=parser.parse_args();probe=args.probe.resolve();effect_root=args.library/'effects-ready';pending_root=args.library/'texture-pending'
    verified=0
    for root in [effect_root,pending_root]:
        manifest=json.loads((root/'asset-sources.json').read_text(encoding='utf-8'))
        for record in manifest['generatedFiles']+[dict(r,path='SourceAssets/'+r['path']) for r in manifest['sourceFiles']]:
            path=root/record['path'];assert path.stat().st_size==record['bytes'] and digest(path)==record['sha256'],path;verified+=1
        for path,value in manifest['converter'].items():assert digest(ROOT/path)==value,path
    effect_catalog=json.loads((effect_root/'Assets/WarcraftIII/effect-catalog.json').read_text(encoding='utf-8'))['models']
    keys=[];expected=[]
    for model in effect_catalog:
        path=effect_root/model['effect'];data=json.loads(path.read_text(encoding='utf-8'));frames=[f for c in data['clips'] for f in c['frames']]
        keys.append(str(path.resolve()));expected.append(dict(clips=len(data['clips']),frames=len(frames),particles=sum(len(f['particles']) for f in frames),quads=sum(len(f['quads']) for f in frames),lights=sum(len(f['lights']) for f in frames)))
        prefab=json.loads((effect_root/model['prefab']).read_text(encoding='utf-8'));assert prefab['root']['components']['SampledEffect']['effect']==model['effect']
        for material in data['materials']:
            assert (effect_root/material['texture']).is_file(),material['texture']
    run=subprocess.run([str(probe),'--stdin'],input='\n'.join(keys)+'\n',capture_output=True,text=True,encoding='utf-8')
    assert run.returncode==0,run.stderr;native=[json.loads(s) for s in run.stdout.splitlines()];assert len(native)==len(expected)
    for actual,reference in zip(native,expected):
        assert all(actual[k]==v for k,v in reference.items()),(actual,reference)
    geometry=json.loads((pending_root/'Assets/WarcraftIII/texture-pending-catalog.json').read_text(encoding='utf-8'))['models'];keys=[]
    for model in geometry:
        for part in model['parts']:
            keys.append(str((pending_root/part['mesh']).resolve()))
            for index,clip in enumerate(model['clips']):
                for frame in [0,clip['frameCount'],clip['frameCount']+3]:keys.append(str((pending_root/part['animatedMesh']).resolve())+f'#pose={index}:{frame}')
    run=subprocess.run([str(probe),'--stdin'],input='\n'.join(keys)+'\n',capture_output=True,text=True,encoding='utf-8');assert run.returncode==0,run.stderr
    native_geometry=[json.loads(s) for s in run.stdout.splitlines()];assert len(native_geometry)==len(keys);assert all(m['vertices']>0 for m in native_geometry)
    # Consecutive terminal and beyond-terminal requests must return the same authored geometry bounds.
    holds=0
    for i,key in enumerate(keys):
        if '#pose=' in key and i+1<len(keys) and '#pose=' in keys[i+1]:
            a,b=native_geometry[i:i+2]
            frame=int(key.rsplit(':',1)[1]);next_frame=int(keys[i+1].rsplit(':',1)[1])
            if next_frame==frame+3:assert a['vertices']==b['vertices'] and a['min']==b['min'] and a['max']==b['max'];holds+=1
    report=dict(nativePassed=True,probeSha256=digest(probe),hashVerifiedFiles=verified,effectSources=len(effect_catalog),effectClips=sum(e['clips'] for e in expected),effectFrames=sum(e['frames'] for e in expected),sampledParticles=sum(e['particles'] for e in expected),sampledQuads=sum(e['quads'] for e in expected),sampledLights=sum(e['lights'] for e in expected),metadataOnly=sum(m['metadataOnly'] for m in effect_catalog),pendingGeometryModels=len(geometry),nativeGeometryLoads=len(keys),terminalHolds=holds,scope='Fresh native asset parsing and pose bounds validation. GPU previews are recorded separately; full Warcraft effect solver and gameplay/camera integration are incomplete.')
    path=ROOT/'docs/designs/frostbound-realms/supplemental-conversion-validation.json';path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('PASS supplemental conversion verification:',json.dumps(report))

if __name__=='__main__':main()

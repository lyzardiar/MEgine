"""Author: MiYu. Compare native cliff patches with every authored GLB and shared boundary profile."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path, PureWindowsPath
import subprocess

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
spec = importlib.util.spec_from_file_location('warcraft_validation', ROOT / 'scripts/validate-warcraft-assets.py')
validation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validation)

PLANE_TOLERANCE = 1e-5

def boundary_segments(mesh, axis, value):
    points = np.array(mesh['positions'])
    other = 2 if axis == 0 else 0
    segments = []
    for indices in np.array(mesh['indices']).reshape(-1, 3):
        vertices=points[indices].copy();section=[]
        vertices[abs(vertices[:,axis]-value)<PLANE_TOLERANCE,axis]=value
        for p,q in [(vertices[0],vertices[1]),(vertices[1],vertices[2]),(vertices[2],vertices[0])]:
            first,second=p[axis]-value,q[axis]-value
            if abs(first)<1e-7:
                section.append(p)
            if first*second<0:
                section.append(p+(q-p)*(-first/(second-first)))
        for i,p in enumerate(section):
            for q in section[i+1:]:
                delta=q[other]-p[other]
                if abs(delta)>1e-7:
                    lo,hi=sorted([p[other],q[other]])
                    slope=(q[1]-p[1])/delta
                    segments.append((lo,hi,slope,p[1]-slope*p[other]))
    return segments

def boundary(segments, t, base=0):
    values=[slope*t+offset+base for lo,hi,slope,offset in segments if lo<t<hi]
    return max(values) if values else None

def compare_profiles(first, second, first_base=0, second_base=0):
    # Each open interval has a linear upper envelope. Split at segment endpoints
    # and crossings so vertical-wall endpoint ownership cannot create false gaps.
    knots={-1.,0.}
    for segments in [first,second]:
        knots.update(t for lo,hi,_,_ in segments for t in [lo,hi] if -1<t<0)
        for i,(lo,hi,slope,offset) in enumerate(segments):
            for a,b,c,d in segments[i+1:]:
                if abs(slope-c)>1e-10:
                    t=(d-offset)/(slope-c)
                    if max(lo,a,-1)<t<min(hi,b,0):knots.add(t)
    knots=sorted(knots);error,gaps,checked,at,quantization_intervals=0.,0,0,None,0
    for lo,hi in zip(knots,knots[1:]):
        if hi-lo<PLANE_TOLERANCE:
            quantization_intervals+=1
            continue
        for t in [lo+(hi-lo)/4,hi-(hi-lo)/4]:
            a,b=boundary(first,t,first_base),boundary(second,t,second_base)
            checked+=1
            if a is None or b is None:
                gaps+=1
            elif abs(a-b)>error:
                error,at=abs(a-b),t
    return dict(maxDifference=error,at=at,missingSamples=gaps,openIntervalSamples=checked,subToleranceIntervals=quantization_intervals)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pose-probe',type=Path,required=True)
    args=parser.parse_args()
    manifest=json.loads((SAMPLE/'classic-cliff-sources.json').read_text())
    for f in manifest['files']:
        assert hashlib.sha256((SAMPLE/f['path']).read_bytes()).hexdigest()==f['sha256'],f['path']
    assert hashlib.sha256((ROOT/manifest['generator']).read_bytes()).hexdigest()==manifest['generatorSha256']
    catalog=json.loads((SAMPLE/'Assets/WarcraftIII/classic-cliff-catalog.json').read_text())
    source=ROOT/'asset-library/warcraft-iii/remaining-ready'
    source_models={m['source']:m for m in json.loads((source/'Assets/WarcraftIII/model-catalog.json').read_text())['models']}
    patch_path=SAMPLE/catalog['mesh']
    patch=json.loads(patch_path.read_text())
    probe=subprocess.Popen([str(args.pose_probe),'--stdin','--positions','--normals','--uvs'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8')
    samples,vertices,seams,max_error=0,0,0,0.
    profiles=[];unequal=[];corner_offsets=[]
    try:
        for record in catalog['models']:
            path=ROOT/'asset-library/warcraft-iii/remaining-ready'/record['mesh']
            assert hashlib.sha256(path.read_bytes()).hexdigest()==record['meshSha256']
            original=source/'SourceAssets'/Path(*PureWindowsPath(record['model']).parts)
            assert hashlib.sha256(original.read_bytes()).hexdigest()==record['sourceSha256']
            material=source/source_models[record['model']]['parts'][0]['material']
            assert hashlib.sha256(material.read_bytes()).hexdigest()==record['materialSha256']
            doc,blob=validation.load_glb(path)
            prim=doc['meshes'][0]['primitives'][0]
            expected={key:validation.accessor(doc,blob,prim['attributes'][channel]) for key,channel in [('positions','POSITION'),('normals','NORMAL'),('uvs','TEXCOORD_0')]}
            mesh=patch['templates'][record['template']]
            for key,values in expected.items():
                assert np.array_equal(np.array(mesh[key],dtype=np.float32),values),(record['id'],key)
            assert np.array_equal(mesh['indices'],validation.accessor(doc,blob,prim['indices']).reshape(-1))
            heights=[ord(c)-65 for c in record['pattern']]
            for corner,(x,z) in enumerate([(-1,0),(-1,-1),(0,-1),(0,0)]):
                positions=expected['positions']
                distance=np.max(abs(positions[:,[0,2]]-[x,z]),axis=1)
                at=positions[distance<validation.converter.POSE_TOLERANCE]
                assert len(at) and abs(max(at[:,1])-heights[corner])<validation.converter.POSE_TOLERANCE,(record['id'],corner)
                exact=positions[distance<1e-6]
                if not len(exact) or abs(max(exact[:,1])-heights[corner])>=1e-6:
                    corner_offsets.append(dict(model=record['id'],corner=corner,nearestHorizontalOffset=float(min(distance)),heightOffset=float(max(at[:,1])-heights[corner])))
            for axis,value,a,b in [(0,-1,1,0),(0,0,2,3),(2,-1,1,2),(2,0,0,3)]:
                base=min(heights[a],heights[b])
                profiles.append(dict(model=record['id'],family=record['family'],axis=axis,side=value,endpoints=[heights[a]-base,heights[b]-base],base=-base,segments=boundary_segments(mesh,axis,value)))
            for height in [-2,0,4]:
                cells=f'{record["template"]:03x}{128+height*2:02x}'+'fff80'*15
                probe.stdin.write('meshpatch:'+str(patch_path)+'#'+cells+'\n');probe.stdin.flush();line=probe.stdout.readline();assert line,record['id'];native=json.loads(line)
                positions=expected['positions']*np.float32(2)+np.array([-2,height,-2],dtype=np.float32)
                error=float(np.max(abs(np.array(native['positions'])-positions)));assert error<1e-6,(record['id'],error)
                max_error=max(max_error,error);assert np.array_equal(np.array(native['normals'],dtype=np.float32),expected['normals']);assert np.array_equal(np.array(native['uvs'],dtype=np.float32),expected['uvs']);assert native['vertices']==len(positions)
                samples+=1;vertices+=len(positions)
        probe.stdin.close();assert probe.wait(timeout=10)==0
    finally:
        if probe.poll() is None:
            probe.kill();probe.wait()
    for first in profiles:
        if first['side']!=0:continue
        for second in profiles:
            if second['side']!=-1 or any(first[k]!=second[k] for k in ['family','axis','endpoints']):continue
            comparison=compare_profiles(first['segments'],second['segments'],first['base'],second['base'])
            seams+=1
            if comparison['maxDifference']>=1e-5 or comparison['missingSamples']:
                unequal.append(dict(first=first['model'],second=second['model'],axis=first['axis'],endpoints=first['endpoints'],**comparison))
    fixture=json.loads((ROOT/'docs/designs/frostbound-realms/classic-cliff-patches.json').read_text())
    fixture_seams=0;fixture_quantization_intervals=0
    for panel in fixture['patches']:
        for cell in panel['selected']:
            x,z=cell['x'],cell['z'];mesh=patch['templates'][cell['template']]
            for dx,dz,axis,a,b in [(1,0,0,0,-1),(0,1,2,0,-1)]:
                if x+dx>=4 or z+dz>=4:
                    continue
                neighbor=panel['selected'][(z+dz)*4+x+dx];other=patch['templates'][neighbor['template']]
                comparison=compare_profiles(boundary_segments(mesh,axis,a),boundary_segments(other,axis,b),cell['base'],neighbor['base'])
                assert comparison['maxDifference']<1e-5 and not comparison['missingSamples'],(panel['name'],x,z,dx,dz,comparison)
                fixture_quantization_intervals+=comparison['subToleranceIntervals']
                fixture_seams+=1
    report=dict(authoredTemplates=len(catalog['models']),families={k:len(v) for k,v in catalog['families'].items()},nativePatchChecks=samples,nativeVertices=vertices,maxPositionError=max_error,boundaryProfileComparisons=seams,unequalSourceProfiles=unequal,authoredCornerOffsets=corner_offsets,nativeFixtureSeams=fixture_seams,fixtureSubToleranceIntervals=fixture_quantization_intervals,files=len(manifest['files']),boundaryCoordinateTolerance=PLANE_TOLERANCE,scope='Source geometry preservation and selected fixture seams verified within coordinate tolerances; arbitrary matching-corner adjacency is not guaranteed by authored meshes.',probeSha256=hashlib.sha256(args.pose_probe.read_bytes()).hexdigest())
    target=ROOT/'docs/designs/frostbound-realms/classic-cliff-validation.json';target.write_text(json.dumps(report,indent=2)+'\n')
    print('PASS native authored cliff patches:',json.dumps({k:v for k,v in report.items() if k not in ['unequalSourceProfiles','authoredCornerOffsets']}),'unequalSourceProfiles=',len(unequal),'authoredCornerOffsets=',len(corner_offsets))

if __name__=='__main__':
    main()

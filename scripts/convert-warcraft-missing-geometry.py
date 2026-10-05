"""Author: MiYu. Preserve native geometry and animation for sources awaiting original textures."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path, PureWindowsPath
import subprocess
import shutil
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('converter',ROOT/'scripts/convert-warcraft-assets.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,default=ROOT/'asset-library/warcraft-iii/community-ready')
    parser.add_argument('--output',type=Path,default=ROOT/'asset-library/warcraft-iii/texture-pending')
    parser.add_argument('--sampler',type=Path,default=ROOT/'tmp/warcraft-effects/bin/MdxExport.dll')
    args=parser.parse_args(); source=args.input.resolve();output=args.output.resolve();binary=args.sampler.resolve()
    output.mkdir(parents=True,exist_ok=True)
    previous=output/'asset-sources.json'
    if previous.exists():
        saved=json.loads(previous.read_text(encoding='utf-8'))
        for r in saved['generatedFiles']+[dict(r,path='SourceAssets/'+r['path']) for r in saved['sourceFiles']]:
            p=output/c.relative(r['path'])
            if not p.is_file() or digest(p)!=r['sha256']:raise ValueError(f'Preserve modified output: {p}')
    stored=json.loads((source/'asset-sources.json').read_text(encoding='utf-8'))
    sources={r['path'].replace('\\','/').lower():r for r in stored['sourceFiles']}
    failures=json.loads((source/'Validation/extraction-checks.json').read_text(encoding='utf-8'))['failedModels']
    catalog=[];records=[];checks=[]
    for failure in failures:
        record=sources[failure['path'].replace('\\','/').lower()];original=source/'SourceAssets'/c.relative(record['path'])
        assert digest(original)==record['sha256']
        sample_path=ROOT/'tmp/warcraft-effects/texture-pending'/c.relative(record['path']).with_suffix('.json');sample_path.parent.mkdir(parents=True,exist_ok=True)
        run=subprocess.run(['dotnet',str(binary),str(original),str(sample_path)],capture_output=True,text=True,encoding='utf-8',errors='replace')
        if run.returncode:raise ValueError(f'{original}: {run.stderr[:1400]}')
        sample=json.loads(sample_path.read_text(encoding='utf-8'));checks.append(dict(source=record['path'],**c.check_poses(sample)))
        model=sample['model'];parts=[]
        for g in model['geosets']:
            positions=c.vectors(g['positions'])@c.AXES.T/128
            normals=c.vectors(g['normals'])@c.AXES.T if g['normals'] else np.zeros_like(positions)
            if not g['normals']:
                triangles=np.asarray(g['indices']).reshape(-1,3);face=np.cross(positions[triangles[:,1]]-positions[triangles[:,0]],positions[triangles[:,2]]-positions[triangles[:,0]])
                for corner in range(3):np.add.at(normals,triangles[:,corner],face)
                lengths=np.linalg.norm(normals,axis=1);normals[lengths>1e-10]/=lengths[lengths>1e-10,None];normals[lengths<=1e-10]=[0,1,0]
            for layer_index,layer in enumerate(model['materials'][g['materialId']]['layers']):
                uv=[[v['x'],v['y']] for v in g['uvLayers'][layer['coordId']]]
                stem='Assets/WarcraftIII/TexturePending/'+PureWindowsPath(record['path']).with_suffix('').as_posix()+f'/geoset-{g["index"]:02}-layer-{layer_index:02}'
                static=c.Glb();static.mesh(sample['restGeometry'][g['index']]['positions'],sample['restGeometry'][g['index']]['normals'],uv,g['indices']);static.save(output/(stem+'.glb'))
                animated=stem+'-animated.glb'
                c.animated_mesh(sample,g,uv,positions,normals,layer_index if layer['textureAnimationId']>=0 else None).save(output/animated)
                parts.append(dict(mesh=stem+'.glb',animatedMesh=animated,geoset=g['index'],layer=layer_index,sourceMaterial=model['materials'][g['materialId']],sourceTextures=model['textures']))
        state='Assets/WarcraftIII/TexturePending/'+PureWindowsPath(record['path']).with_suffix('.states.json').as_posix()
        c.json_write(output/state,dict(fps=12,clips=[dict(name=clip['name'],frames=[f['state'] for f in clip['frames']]) for clip in sample['clips']]),compact=True)
        catalog.append(dict(source=record['path'],parts=parts,stateTracks=state,clips=[{k:clip[k] for k in ['name','duration','loop','frameCount']} for clip in sample['clips']],status='geometry-converted-awaiting-original-textures',missingTexture=failure['error']))
        target=output/'SourceAssets'/c.relative(record['path']);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(original.read_bytes());records.append(record)
    c.json_write(output/'Assets/WarcraftIII/texture-pending-catalog.json',dict(schemaVersion=1,models=catalog))
    for p in (output/'Assets').rglob('*'):
        if p.is_file():c.sidecar(p,output)
    generated=[dict(path=p.relative_to(output).as_posix(),bytes=p.stat().st_size,sha256=digest(p)) for p in sorted((output/'Assets').rglob('*')) if p.is_file()]
    tools=[Path(__file__),ROOT/'scripts/convert-warcraft-assets.py',ROOT/'scripts/warcraft-assets/Program.cs',ROOT/'scripts/warcraft-assets/TextureTracks.cs',ROOT/'scripts/warcraft-assets/EffectExport.cs',ROOT/'scripts/warcraft-assets/MdxExport.csproj']
    c.json_write(output/'asset-sources.json',dict(sourceCollection='community-ready',sourceFiles=records,generatedFiles=generated,converter={p.relative_to(ROOT).as_posix():digest(p) for p in tools},upstream=dict(url=c.UPSTREAM,commit=c.COMMIT,archiveSha256=digest(ROOT/'tmp/warcraft-converter'/c.COMMIT/'upstream.zip')),scope='Native geometry and animation only; original material texture references retained. No substitute textures or battlefield prefabs generated.'))
    licenses=output/'Licenses';licenses.mkdir(exist_ok=True);shutil.copyfile(ROOT/'tmp/warcraft-converter'/c.COMMIT/'upstream/LICENSE',licenses/'converter-MIT.txt')
    c.json_write(output/'Validation/conversion-checks.json',dict(geometryModels=len(catalog),parts=sum(len(m['parts']) for m in catalog),clips=sum(len(m['clips']) for m in catalog),poseComparison=checks,missingDependencies=failures))
    print('PASS texture-pending geometry:',len(catalog),'models;',sum(len(m['parts']) for m in catalog),'parts')

if __name__=='__main__':main()

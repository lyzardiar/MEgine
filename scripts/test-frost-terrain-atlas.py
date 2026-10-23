"""Author: MiYu. Native atlas isolation fixture and unchanged source-map geometry checks."""
import argparse
import importlib
import json
import math
from pathlib import Path
import tempfile
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
builder=importlib.import_module('build-frost-original-terrain')
COLORS=[(255,0,0,255),(0,255,0,255),(0,0,255,255),(255,255,0,255),(0,255,255,255),(255,0,255,255)]

def fixture():
    parent=ROOT/'tmp/docs-artifacts/warcraft-map-tests';parent.mkdir(parents=True,exist_ok=True)
    output=Path(tempfile.mkdtemp(prefix='atlas-fixture-',dir=parent))
    for mode,stride,inset,span in [('fixed',64,.5,63),('legacy',68,2,64)]:
        image=Image.new('RGBA',(stride*3,stride*2));positions=[];uvs=[];indices=[]
        for index,color in enumerate(COLORS):
            tile=Image.new('RGBA',(64,64),color);x,y=index%3*stride,index//3*stride
            image.paste(builder.padded(tile) if mode=='legacy' else tile,(x,y))
            start=len(positions);positions.extend([[index,0,0],[index,0,-1],[index+1,0,-1],[index+1,0,0]])
            uvs.extend([[(x+inset+u*span)/image.width,(y+inset+v*span)/image.height] for u,v in [(0,1),(0,0),(1,0),(1,1)]])
            indices.extend(start+i for i in [0,3,1,1,3,2])
        (output/'Assets/Textures').mkdir(parents=True,exist_ok=True);image.save(output/f'Assets/Textures/{mode}.png')
        mesh=builder.converter.Glb();mesh.mesh(positions,[[0,1,0]]*len(positions),uvs,indices);mesh.save(output/f'Assets/Models/{mode}.glb')
        shader=builder.ground_shader(image.size);body=shader.split('*/\n',1)[1].split('fn mengine_lit_surface_hook',1)[0]
        metadata=dict(parameters=[dict(name='test_lod',type='vector4',default=[0,0,0,0])],textures=[dict(name='ground',type='color',default=f'Assets/Textures/{mode}.png')])
        sample='source_ground_sample(uv,mengine_param_test_lod().x)' if mode=='fixed' else 'textureSampleLevel(mengine_custom_texture_0,material_sampler,uv,mengine_param_test_lod().x)'
        shader='/* MENGINE_PARAMETERS\n'+json.dumps(metadata)+'\n*/\n'+body+f'''fn mengine_lit_surface_hook(surface:MEngineSurface,uv:vec2<f32>,world_position:vec3<f32>) -> MEngineSurface {{
    var s=surface;s.base_color=vec3<f32>(0.0);s.emissive={sample}.rgb;s.alpha=1.0;return s;
}}
'''
        (output/'Assets/Shaders').mkdir(exist_ok=True);(output/f'Assets/Shaders/{mode}.mshader').write_text(shader,encoding='utf-8')
        builder.write_json(output/f'Assets/Materials/{mode}.mmat',dict(version=8,name=mode,shader='custom',custom_shader=f'Assets/Shaders/{mode}.mshader',surface='opaque',base_color=[0,0,0,1],roughness=1,wrap_u='clamp',wrap_v='clamp'))
    scene=dict(version=1,name='Terrain atlas isolation',world=dict(clear_color=[0,0,0,1],entities=[
        dict(entity=1,name='Camera',active=True,components=dict(Transform=dict(position=[3,8,-.5],rotation=[-math.sqrt(.5),0,0,math.sqrt(.5)]),Camera3D=dict(primary=True,projection='orthographic',orthographic_size=2,near=.1,far=20))),
        dict(entity=2,name='Tiles',active=True,components=dict(Transform=dict(position=[0,0,0]),MeshRenderer=dict(mesh='Assets/Models/fixed.glb',material='Assets/Materials/fixed.mmat'),MaterialPropertyBlock=dict(custom_parameter_names=['test_lod'],custom_parameter_values=[[0,0,0,0]])))]))
    builder.write_json(output/'Assets/Scenes/Main.mscene',scene)
    (output/'Assets/Scripts').mkdir();(output/'Assets/Scripts/Main.js').write_text('function onTick(dt){}\n',encoding='utf-8')
    builder.write_json(output/'project.json',dict(name='Terrain atlas isolation',version=1,language='javascript',mainScene='Assets/Scenes/Main.mscene',startupScript='Assets/Scripts/Main.js',buildScenes=['Assets/Scenes/Main.mscene']))
    print(json.dumps(dict(project=str(output))))

def verify_native(report_path):
    report=json.loads(report_path.read_bytes());results=[]
    assert sorted((s['mode'],s['lod']) for s in report['shots'])==sorted([('fixed',v) for v in [0,2.5,3,4,5.5,6,8]]+[('legacy',3),('legacy',6)])
    baseline=next(shot for shot in report['shots'] if shot['mode']=='fixed' and shot['lod']==0)
    reference=np.asarray(Image.open(baseline['path']).convert('RGB'))
    for shot in report['shots']:
        pixels=np.asarray(Image.open(shot['path']).convert('RGB'));height,width,_=pixels.shape
        assert pixels.shape==reference.shape
        # Orthographic half-height 2 and six unit-wide planes centered on x=3.
        wrong=[];lit=[];difference=[]
        for index,color in enumerate(COLORS):
            left=round(width/2+(index-3)*height/4);right=round(width/2+(index-2)*height/4)
            area=pixels[height//2-12:height//2+12,left+2:right-2]
            missing=np.array(color[:3])==0;present=~missing
            wrong.append(int(area[:,:,missing].max()));lit.append(int(area[:,:,present].min()))
            center=reference[height//2,round((left+right)/2)].astype(int)
            difference.append(int(np.abs(area.astype(int)-center).max()))
        results.append(dict(mode=shot['mode'],lod=shot['lod'],foreignChannelMax=max(wrong),presentChannelMin=min(lit),maxDifferenceFromTileCenter=max(difference)))
        # Native ambient/specular contributes a fixed nonzero floor; compare with the same tile at LOD 0.
        if shot['mode']=='fixed':assert max(difference)<=1 and min(lit)>100,results[-1]
    legacy=[r for r in results if r['mode']=='legacy'];assert any(r['foreignChannelMax']>30 for r in legacy),'Legacy GPU path must reproduce neighboring-tile contamination'
    report['pixelChecks']=results;report_path.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(results))

def verify_map(before,after):
    validation=importlib.import_module('test-warcraft-terrain').validation
    old=json.loads((before/'terrain-sources.json').read_bytes());new=json.loads((after/'terrain-sources.json').read_bytes())
    assert old['mapSha256']==new['mapSha256'];assert old['atlasTiles']==new['atlasTiles']
    assert [m['path'] for m in old['meshes']]==[m['path'] for m in new['meshes']]
    for record in old['meshes']:
        a_doc,ab=validation.load_glb(before/record['path']);b_doc,bb=validation.load_glb(after/record['path'])
        a=a_doc['meshes'][0]['primitives'][0];b=b_doc['meshes'][0]['primitives'][0]
        for name in ['POSITION','NORMAL']:
            assert np.array_equal(validation.accessor(a_doc,ab,a['attributes'][name]),validation.accessor(b_doc,bb,b['attributes'][name])),record['path']
        assert np.array_equal(validation.accessor(a_doc,ab,a['indices']),validation.accessor(b_doc,bb,b['indices']))
    a=Image.open(before/'Assets/Textures/Ground.png');b=Image.open(after/'Assets/Textures/Ground.png');cols=b.width//64
    for index in range(new['atlasTiles']):
        x,y=index%cols,index//cols
        assert a.crop((x*68+2,y*68+2,x*68+66,y*68+66)).tobytes()==b.crop((x*64,y*64,x*64+64,y*64+64)).tobytes()
    print(json.dumps(dict(meshes=len(new['meshes']),tiles=new['atlasTiles'],unchanged='positions, normals, indices, base tile pixels',oldAtlas=list(a.size),newAtlas=list(b.size))))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--verify-native',type=Path);parser.add_argument('--compare-map',nargs=2,type=Path);args=parser.parse_args()
    if args.verify_native:verify_native(args.verify_native)
    elif args.compare_map:verify_map(*args.compare_map)
    else:fixture()

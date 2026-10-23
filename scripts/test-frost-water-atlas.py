"""Author: MiYu. Compare water atlas filtering with independent repeat-wrapped frame textures."""
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

def fixture():
    parent=ROOT/'tmp/docs-artifacts/warcraft-map-tests';parent.mkdir(parents=True,exist_ok=True)
    output=Path(tempfile.mkdtemp(prefix='water-atlas-fixture-',dir=parent));size=128
    atlas=Image.new('RGBA',(size*8,size*6));legacy=Image.new('RGBA',((size+4)*8,(size+4)*6))
    (output/'Assets/Textures').mkdir(parents=True)
    for frame in range(45):
        y,x=np.mgrid[:size,:size];data=np.stack(((x*2+frame*17)%256,(y*2+frame*43)%256,np.full_like(x,(frame*71)%256),(x+y+frame*11)%256),axis=-1).astype('uint8');image=Image.fromarray(data)
        image.save(output/f'Assets/Textures/frame-{frame}.png');atlas.paste(image,(frame%8*size,frame//8*size));legacy.paste(builder.padded(image),(frame%8*(size+4),frame//8*(size+4)))
    atlas.save(output/'Assets/Textures/atlas.png');legacy.save(output/'Assets/Textures/legacy.png')
    (output/'Assets/Shaders').mkdir()
    for mode in ['fixed','legacy',*[f'reference-{frame}' for frame in [0,7,8,44]]]:
        texture='atlas' if mode=='fixed' else 'legacy' if mode=='legacy' else 'frame-'+mode.split('-')[1]
        metadata=dict(parameters=[dict(name='test',type='vector4',default=[0,0,0,0])],textures=[dict(name='water',type='color',default=f'Assets/Textures/{texture}.png')])
        body=builder.water_atlas_sampling(size,atlas.size) if mode=='fixed' else ''
        sample='source_water_sample(u32(mengine_param_test().x),uv,mengine_param_test().y)'
        if mode.startswith('reference'):sample='textureSampleLevel(mengine_custom_texture_0,material_sampler,uv,mengine_param_test().y)'
        if mode=='legacy':
            body+='fn legacy_uv(uv:vec2<f32>) -> vec2<f32> {let frame=u32(mengine_param_test().x);return (vec2<f32>(f32(frame%8u),f32(frame/8u))*132.0+vec2<f32>(2.0)+fract(uv)*128.0)/vec2<f32>(1056.0,792.0);}\n'
            sample='textureSampleLevel(mengine_custom_texture_0,material_sampler,legacy_uv(uv),mengine_param_test().y)'
        shader='/* MENGINE_PARAMETERS\n'+json.dumps(metadata)+'\n*/\n'+body+f'''fn mengine_lit_surface_hook(surface:MEngineSurface,uv:vec2<f32>,world_position:vec3<f32>) -> MEngineSurface {{
    let c={sample};var s=surface;s.base_color=vec3<f32>(0.0);s.emissive=vec3<f32>(c.r,c.g,c.a);s.alpha=1.0;return s;
}}
'''
        (output/f'Assets/Shaders/{mode}.mshader').write_text(shader,encoding='utf-8')
        builder.write_json(output/f'Assets/Materials/{mode}.mmat',dict(version=8,name=mode,shader='custom',custom_shader=f'Assets/Shaders/{mode}.mshader',surface='opaque',base_color=[0,0,0,1],roughness=1,wrap_u='repeat',wrap_v='repeat'))
    for frame in [0,7,8,44]:
        metadata=dict(parameters=[dict(name='test',type='vector4',default=[0,0,0,0])],textures=[dict(name='water',type='color',default='Assets/Textures/atlas.png'),dict(name='reference',type='color',default=f'Assets/Textures/frame-{frame}.png')])
        shader='/* MENGINE_PARAMETERS\n'+json.dumps(metadata)+'\n*/\n'+builder.water_atlas_sampling(size,atlas.size)+'''fn mengine_lit_surface_hook(surface:MEngineSurface,uv:vec2<f32>,world_position:vec3<f32>) -> MEngineSurface {
    let a=source_water_sample(u32(mengine_param_test().x),uv,mengine_param_test().y);
    let b=textureSampleLevel(mengine_custom_texture_1,material_sampler,uv,mengine_param_test().y);
    var s=surface;s.base_color=vec3<f32>(0.0);s.emissive=select(vec3<f32>(0.0,1.0,0.0),vec3<f32>(1.0,0.0,0.0),any(abs(a-b)>vec4<f32>(1.0/256.0)));s.alpha=1.0;return s;
}
'''
        (output/f'Assets/Shaders/compare-{frame}.mshader').write_text(shader,encoding='utf-8')
        builder.write_json(output/f'Assets/Materials/compare-{frame}.mmat',dict(version=8,name=f'compare-{frame}',shader='custom',custom_shader=f'Assets/Shaders/compare-{frame}.mshader',surface='opaque',base_color=[0,0,0,1],roughness=1,wrap_u='repeat',wrap_v='repeat'))
    mesh=builder.converter.Glb();mesh.mesh([[-3,0,1],[-3,0,-1],[3,0,-1],[3,0,1]],[[0,1,0]]*4,[[-.25,1.25],[-.25,-.25],[2.25,-.25],[2.25,1.25]],[0,3,1,1,3,2]);mesh.save(output/'Assets/Models/Water.glb')
    builder.write_json(output/'Assets/Scenes/Main.mscene',dict(version=1,name='Water atlas isolation',world=dict(clear_color=[0,0,0,1],entities=[
        dict(entity=1,name='Camera',active=True,components=dict(Transform=dict(position=[0,8,0],rotation=[-math.sqrt(.5),0,0,math.sqrt(.5)]),Camera3D=dict(primary=True,projection='orthographic',orthographic_size=2,near=.1,far=20))),
        dict(entity=2,name='Water',active=True,components=dict(Transform=dict(position=[0,0,0]),MeshRenderer=dict(mesh='Assets/Models/Water.glb',material='Assets/Materials/fixed.mmat'),MaterialPropertyBlock=dict(custom_parameter_names=['test'],custom_parameter_values=[[0,0,0,0]])))])))
    (output/'Assets/Scripts').mkdir();(output/'Assets/Scripts/Main.js').write_text('function onTick(dt){}\n',encoding='utf-8')
    builder.write_json(output/'project.json',dict(name='Water atlas isolation',version=1,language='javascript',mainScene='Assets/Scenes/Main.mscene',startupScript='Assets/Scripts/Main.js',buildScenes=['Assets/Scenes/Main.mscene']))
    print(json.dumps(dict(project=str(output))))

def verify(report_path):
    report=json.loads(report_path.read_bytes());checks=[]
    assert len(report['cases'])==16
    assert {(c['frame'],c['lod']) for c in report['cases']}=={(f,l) for f in [0,7,8,44] for l in [0,2.5,7,10]}
    for case in report['cases']:
        a=np.asarray(Image.open(case['fixed']).convert('RGB'),dtype=int);b=np.asarray(Image.open(case['reference']).convert('RGB'),dtype=int);assert a.shape==b.shape
        diff=np.abs(a-b);checks.append(dict(frame=case['frame'],lod=case['lod'],maxDifference=int(diff.max()),meanDifference=float(diff.mean())))
        mask=np.asarray(Image.open(case['comparison']).convert('RGB'));h,w,_=mask.shape
        region=mask[h//4+3:3*h//4-3,round(w/2-3*h/4)+3:round(w/2+3*h/4)-3]
        checks[-1]['linearFilterErrorBound']=1/256
        assert region[:,:,0].max()<=8 and region[:,:,1].min()>200 and region[:,:,2].max()<=8,checks[-1]
        assert diff.mean()<.01,checks[-1]
    old=np.asarray(Image.open(report['legacy']).convert('RGB'),dtype=int);ref=np.asarray(Image.open(report['cases'][2]['reference']).convert('RGB'),dtype=int)
    assert report['cases'][2]['frame']==0 and report['cases'][2]['lod']==7
    report['legacyMaxDifference']=int(np.abs(old-ref).max());assert report['legacyMaxDifference']>30
    report['pixelChecks']=checks;report_path.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(dict(checks=checks,legacyMaxDifference=report['legacyMaxDifference'])))

def compare_map(before,after):
    old=json.loads((before/'terrain-sources.json').read_bytes());new=json.loads((after/'terrain-sources.json').read_bytes())
    assert old['mapSha256']==new['mapSha256'];assert old['meshes']==new['meshes'];assert old['entities']==new['entities']
    for file in ['Assets/Scenes/Main.mscene','Assets/Scripts/Main.js','Assets/Textures/Ground.png','Assets/Textures/WaterDepth.png',*[r['path'] for r in old['meshes']]]:
        assert (before/file).read_bytes()==(after/file).read_bytes(),file
    info=new['waterAtlas'];size=info['frameSize'];a=Image.open(before/'Assets/Textures/Water.png');b=Image.open(after/'Assets/Textures/Water.png')
    for frame in range(info['frames']):
        x,y=frame%8,frame//8
        assert a.crop((x*(size+4)+2,y*(size+4)+2,x*(size+4)+size+2,y*(size+4)+size+2)).tobytes()==b.crop((x*size,y*size,x*size+size,y*size+size)).tobytes()
    print(json.dumps(dict(meshes=len(new['meshes']),frames=info['frames'],unchanged='scene, geometry, UV, script, ground/depth pixels and all water frame pixels',oldAtlas=list(a.size),newAtlas=list(b.size))))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--verify-native',type=Path);parser.add_argument('--compare-map',nargs=2,type=Path);args=parser.parse_args()
    if args.verify_native:verify(args.verify_native)
    elif args.compare_map:compare_map(*args.compare_map)
    else:fixture()

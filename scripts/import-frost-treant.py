"""Author: MiYu. Blender 4.5.9: import the CC-BY-3.0 Entangled Roots tree creature."""
import bpy
import hashlib
import json
from pathlib import Path
import urllib.request
import numpy as np
from mathutils.kdtree import KDTree

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';SOURCE=SAMPLE/'SourceAssets/treant';KEY='RealTreant'
FILES=[('reapertreant.blend','https://opengameart.org/sites/default/files/reapertreant.blend','3c10b829a83c8d16ec834285cc5d93f3640104ed3296d604136fdbcce336245e'),('tree-man-game.blend','https://opengameart.org/sites/default/files/tree%20man%20game.blend','78b3a3ba05fc8d5de600ce01f1f4ecd0cb11ca3d7c9c7a6a86a8c62fb589b04f')]
CLIPS=[('Idle','Idle'),('Walk','Walk'),('Attack','Right Claw Attack'),('Death','Death')]

def main():
    SOURCE.mkdir(parents=True,exist_ok=True);sources=[];generated=[]
    for name,url,sha in FILES:
        target=SOURCE/name
        if not target.exists():
            data=urllib.request.urlopen(url,timeout=180).read()
            if hashlib.sha256(data).hexdigest()!=sha:raise ValueError('Downloaded source hash mismatch: '+name)
            target.write_bytes(data)
        if hashlib.sha256(target.read_bytes()).hexdigest()!=sha:raise ValueError('Source hash mismatch: '+name)
        sources.append({'file':target.relative_to(SAMPLE).as_posix(),'url':url,'sha256':sha,'bytes':target.stat().st_size})
    # Recover the packed original textures; the animated derivative refers to missing external base colors.
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'tree-man-game.blend'),load_ui=False,use_scripts=False)
    textures={}
    for channel,suffix in [('base','Base_Color'),('normal','Normal_OpenGL'),('arm','Roughness')]:
        tiles=[]
        for material in ['tree_man','mask']:
            image=bpy.data.images[material+'_'+suffix+'.png'];assert image.packed_file and list(image.size)==[2048,2048]
            image.scale(1024,1024);pixels=np.empty(1024*1024*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape((1024,1024,4))
            if channel=='arm':
                roughness=pixels[:,:,0].copy();pixels[:]=1;pixels[:,:,1]=roughness;pixels[:,:,2]=0
            tiles.append(pixels)
        atlas=bpy.data.images.new(KEY+' '+channel,width=2048,height=1024,alpha=False);atlas.colorspace_settings.name='sRGB' if channel=='base' else 'Non-Color';atlas.pixels.foreach_set(np.concatenate(tiles,axis=1).ravel())
        relative='Assets/Textures/'+KEY+'_'+channel+'.png';atlas.filepath_raw=str(SAMPLE/relative);atlas.file_format='PNG';atlas.save();textures[channel]=relative;generated.append(relative)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'reapertreant.blend'),load_ui=False,use_scripts=False)
    scene=bpy.context.scene;rig=bpy.data.objects['ReaperTreant'];actions={name:bpy.data.actions[source].copy() for name,source in CLIPS};rig.animation_data_clear();rig.animation_data_create();rig.data.pose_position='REST'
    for obj in list(bpy.data.objects):
        if obj.type not in ['MESH','ARMATURE']:bpy.data.objects.remove(obj,do_unlink=True)
    meshes=sorted((o for o in bpy.data.objects if o.type=='MESH'),key=lambda o:o.name)
    for obj in meshes:
        assert len(obj.data.materials)==1;tile=0 if obj.data.materials[0].name=='tree_man' else 1
        for uv in obj.data.uv_layers.active.data:uv.uv.x=(uv.uv.x+tile)/2
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();mesh=meshes[0];mesh.name=KEY
    weighted=[v for v in mesh.data.vertices if sum(g.weight for g in v.groups)>1e-6];nearest=KDTree(len(weighted))
    for v in weighted:nearest.insert(v.co,v.index)
    nearest.balance()
    # Three source vertices have no skin weights; bind their tiny triangle to the nearest weighted surface.
    for v in mesh.data.vertices:
        if sum(g.weight for g in v.groups)>1e-6:continue
        _,index,_=nearest.find(v.co)
        for group in mesh.data.vertices[index].groups:mesh.vertex_groups[group.group].add([v.index],group.weight,'REPLACE')
    bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    modifier=mesh.modifiers.new('Stable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name)
    for face in mesh.data.polygons:face.use_smooth=True;face.material_index=0
    mesh.data.materials.clear();mesh.data.materials.append(bpy.data.materials.new(KEY+' atlas'))
    points=[mesh.matrix_world@v.co for v in mesh.data.vertices];low=min(p.z for p in points);scale=4.2/(max(p.z for p in points)-low);rig.scale=(scale,)*3;rig.location.z=-low*scale;rig.data.pose_position='POSE'
    clips=[]
    for index,(name,_) in enumerate(CLIPS):
        action=actions[name];action.name=KEY+' '+name;start,end=action.frame_range
        rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
        rig.animation_data.action=None;track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,0,action);strip.action_frame_start=start;strip.action_frame_end=end;strip.frame_start=0;strip.frame_end=end-start
        clips.append({'name':name,'frames':max(1,round((end-start)/scene.render.fps*12))})
    bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    model='Assets/Models/'+KEY+'.glb';bpy.ops.export_scene.gltf(filepath=str(SAMPLE/model),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_optimize_animation_size=False,export_extras=False)
    material='Assets/Materials/'+KEY+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':KEY,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':textures['base'],'normal_texture':textures['normal'],'normal_scale':1,'metallic_roughness_texture':textures['arm'],'occlusion_texture':textures['arm'],'metallic':0,'roughness':1,'double_sided':True}))
    size=[(max(p[i] for p in points)-min(p[i] for p in points))*scale for i in [0,2,1]];generated.extend([model,material]);catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());catalog[KEY]={'material':material,'parts':[{'name':KEY,'mesh':model,'pivot':[0,0,0]}],'animations':clips,'size':size,'realistic':True,'attackEvent':.5};catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')
    license_text='''Entangled Roots / RealTreant
Model and textures: piacenti (https://opengameart.org/users/piacenti)
Animations: mysterymagination (https://opengameart.org/users/mysterymagination)
Original concept Alraune Rootling: Misha
https://opengameart.org/content/entangled-roots
https://opengameart.org/content/entangled-roots-with-animations
https://opengameart.org/content/alraune-rootling
Creative Commons Attribution 3.0 Unported (CC-BY-3.0)
https://creativecommons.org/licenses/by/3.0/
MEngine adaptations: recovered original packed textures, joined body and mask,
bound three unweighted vertices to their nearest surface, normalized four-bone
weights, 2048x1024 texture atlases, resized rig and GLB export.
Derived files: Assets/Models/RealTreant.glb, Assets/Textures/RealTreant_*.png,
Assets/Materials/RealTreant.mmat and the RealTreant unit portrait.
Source URLs and hashes: treant-sources.json. Generator: scripts/import-frost-treant.py.
'''
    for folder in ['Licenses','Assets/Licenses']:(SAMPLE/folder/'Entangled-Roots.txt').write_bytes(license_text.encode('utf-8'))
    manifest={'license':'CC-BY-3.0','licenseUrl':'https://creativecommons.org/licenses/by/3.0/','authors':['piacenti','mysterymagination','Misha'],'generator':'scripts/import-frost-treant.py','sources':sources,'models':{KEY:{'triangles':len(mesh.data.polygons),'bones':len(rig.data.bones),'size':size,'clips':clips}},'generated':[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in generated]};(SAMPLE/'treant-sources.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Imported',KEY,manifest['models'][KEY],flush=True)

if __name__=='__main__':main()

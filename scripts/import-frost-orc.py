"""Author: MiYu. Blender 4.5.9: import GuieA_7's licensed animated orc and warhammer."""
import bpy
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile
import numpy as np
from mathutils import Matrix

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';SOURCE=SAMPLE/'SourceAssets/orc';KEY='RealOrc'
CLIPS=[('Idle','wait'),('Walk','walk'),('Attack','attack'),('Death','die')]

def main():
    manifest_path=SAMPLE/'orc-sources.json';manifest=json.loads(manifest_path.read_text());generated=[]
    if any(not (SAMPLE/e['file']).exists() for e in manifest['sources']):
        archive=urllib.request.urlopen(manifest['archive']['url'],timeout=180).read()
        if hashlib.sha256(archive).hexdigest()!=manifest['archive']['sha256']:raise ValueError('Orc archive hash mismatch')
        with zipfile.ZipFile(io.BytesIO(archive)) as pack:
            for entry in pack.infolist():
                if not (SOURCE/entry.filename).resolve().is_relative_to(SOURCE.resolve()):raise ValueError('Archive path escapes source directory')
            pack.extractall(SOURCE)
    for entry in manifest['sources']:
        if hashlib.sha256((SAMPLE/entry['file']).read_bytes()).hexdigest()!=entry['sha256']:raise ValueError('Source hash mismatch: '+entry['file'])
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'Orc/orc.blend'),load_ui=False,use_scripts=False)
    scene=bpy.context.scene;rig=bpy.data.objects['armaorc'];actions={name:bpy.data.actions[source].copy() for name,source in CLIPS};rig.animation_data_clear();rig.animation_data_create();rig.data.pose_position='REST';bpy.context.view_layer.update()
    tiles=[]
    for name in ['orc.png','warhammer.png']:
        image=bpy.data.images.load(str(SOURCE/'Orc'/name),check_existing=False);assert len(image.pixels)>0;image.scale(1024,512);pixels=np.empty(1024*512*4,dtype=np.float32);image.pixels.foreach_get(pixels);tiles.append(pixels.reshape((512,1024,4)))
    atlas=bpy.data.images.new(KEY+' base',width=2048,height=512,alpha=False);atlas.colorspace_settings.name='sRGB';atlas.pixels.foreach_set(np.concatenate(tiles,axis=1).ravel());texture='Assets/Textures/'+KEY+'_base.png';atlas.filepath_raw=str(SAMPLE/texture);atlas.file_format='PNG';atlas.save();generated.append(texture)
    meshes=[bpy.data.objects['orc'],bpy.data.objects['warhammer']]
    for index,obj in enumerate(meshes):
        bpy.context.view_layer.objects.active=obj
        for modifier in list(obj.modifiers):
            if modifier.type!='ARMATURE':bpy.ops.object.modifier_apply(modifier=modifier.name)
        transform=rig.matrix_world.inverted()@obj.matrix_world;obj.data.transform(transform)
        if transform.determinant()<0:obj.data.flip_normals()
        obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
        for uv in obj.data.uv_layers.active.data:uv.uv.x=(uv.uv.x+index)/2
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();mesh=meshes[0];mesh.name=KEY
    bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False);modifier=mesh.modifiers.new('Stable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name)
    for face in mesh.data.polygons:face.material_index=0
    mesh.data.materials.clear();mesh.data.materials.append(bpy.data.materials.new(KEY+' atlas'))
    points=[v.co.copy() for v in mesh.data.vertices];low=min(p.z for p in points);scale=3.4/(max(p.z for p in points)-low);rig.scale=(scale,)*3;rig.location=(0,0,-low*scale);rig.data.pose_position='POSE';clips=[]
    rig.animation_data.action=actions['Idle'];rig.animation_data.action_slot=actions['Idle'].slots[0];scene.frame_set(1);evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());idle=[evaluated.matrix_world@v.co for v in evaluated.data.vertices];size=[max(p[i] for p in idle)-min(p[i] for p in idle) for i in [0,2,1]];rig.animation_data.action=None
    for name,_ in CLIPS:
        action=actions[name];action.name=KEY+' '+name;start,end=action.frame_range;rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];rig.animation_data.action=None
        track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,0,action);strip.action_frame_start=start;strip.action_frame_end=end;strip.frame_start=0;strip.frame_end=end-start;clips.append({'name':name,'frames':max(1,round((end-start)/scene.render.fps*12))})
    bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    model='Assets/Models/'+KEY+'.glb';bpy.ops.export_scene.gltf(filepath=str(SAMPLE/model),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_optimize_animation_size=False,export_extras=False)
    material='Assets/Materials/'+KEY+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':KEY,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':texture,'metallic':0,'roughness':.8,'double_sided':True}));generated.extend([model,material])
    catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());catalog[KEY]={'material':material,'parts':[{'name':KEY,'mesh':model,'pivot':[0,0,0]}],'animations':clips,'size':size,'realistic':True,'attackEvent':7/11};catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')
    license_text='''Orc / RealOrc
Author: Guillaume "GuieA_7" Englert
https://opengameart.org/content/orc-3d
Creative Commons Attribution-ShareAlike 4.0 International (CC-BY-SA-4.0)
https://creativecommons.org/licenses/by-sa/4.0/
MEngine adaptations: normalized mirrored mesh transforms and four-bone skinning,
combined body/hammer texture atlas, resized rig, sampled IK and weapon constraints,
GLB animation export and actual model portrait.
Derived files: Assets/Models/RealOrc.glb, Assets/Textures/RealOrc_base.png,
Assets/Materials/RealOrc.mmat and the RealOrc unit portrait in Assets/Art/unit-portraits.png.
The source and these adaptations remain CC-BY-SA-4.0.
Original Blender, PNG and editable XCF sources are retained in SourceAssets/orc.
Source URL and hashes: orc-sources.json. Generator: scripts/import-frost-orc.py.
'''
    for folder in ['Licenses','Assets/Licenses']:(SAMPLE/folder/'GuieA7-Orc.txt').write_bytes(license_text.encode('utf-8'))
    manifest['models']={KEY:{'triangles':len(mesh.data.polygons),'bones':len(rig.data.bones),'clips':clips,'size':size}};manifest['generated']=[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in generated];manifest_path.write_text(json.dumps(manifest,indent=2)+'\n');print('Imported',KEY,manifest['models'][KEY],flush=True)

if __name__=='__main__':main()

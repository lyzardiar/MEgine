"""Author: MiYu. Import Rosswet Mobile's textured, animated Thin Zombie as the Revenant ghoul."""
import bpy, hashlib, json, math, urllib.request, zipfile
from pathlib import Path
from mathutils import Matrix, Quaternion, Vector

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';SOURCE=SAMPLE/'SourceAssets/ghoul';KEY='RealGhoul'
CLIPS=[('Idle','idle'),('Walk','run'),('Attack','attack2'),('Death','dead1'),('Harvest','attack1_r')]

def main():
    manifest_path=SAMPLE/'ghoul-sources.json';manifest=json.loads(manifest_path.read_text());generated=[]
    for entry in manifest['sources']:
        target=SAMPLE/entry['file']
        if not target.exists() and entry.get('url'):target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(urllib.request.urlopen(entry['url'],timeout=90).read())
    if not (SOURCE/'new_thin_zombie.blend').exists() or not (SOURCE/'new_thin_zombie.png').exists():
        with zipfile.ZipFile(SOURCE/'new_thin_zom.zip') as archive:
            for entry in archive.infolist():assert (SOURCE/entry.filename).resolve().is_relative_to(SOURCE.resolve())
            archive.extractall(SOURCE)
    for entry in manifest['sources']:assert hashlib.sha256((SAMPLE/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'new_thin_zombie.blend'),load_ui=False,use_scripts=False)
    scene=bpy.context.scene;rig=bpy.data.objects['Armature'];mesh=bpy.data.objects['new_thin_zombie'];actions={name:bpy.data.actions[source].copy() for name,source in CLIPS};rig.animation_data_clear();rig.animation_data_create();rig.data.pose_position='REST';bpy.context.view_layer.update()
    transform=rig.matrix_world.inverted()@mesh.matrix_world;mesh.data.transform(transform);mesh.matrix_parent_inverse=Matrix.Identity(4);mesh.matrix_basis=Matrix.Identity(4);mesh.name=KEY
    if transform.determinant()<0:mesh.data.flip_normals()
    bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
    bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False);modifier=mesh.modifiers.new('Stable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name)
    for face in mesh.data.polygons:face.material_index=0
    mesh.data.materials.clear();mesh.data.materials.append(bpy.data.materials.new(KEY+' atlas'))
    rig.data.pose_position='POSE';rig.animation_data.action=actions['Idle'];rig.animation_data.action_slot=actions['Idle'].slots[0];scene.frame_set(0)
    evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());points=[evaluated.matrix_world@v.co for v in evaluated.data.vertices];low=min(p.z for p in points);factor=2.5/(max(p.z for p in points)-low);rig.scale*=factor;rig.location*=factor;rig.location.z-=low*factor;bpy.context.view_layer.update()
    evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());points=[evaluated.matrix_world@v.co for v in evaluated.data.vertices];size=[max(p[i] for p in points)-min(p[i] for p in points) for i in [0,2,1]];rig.animation_data.action=None;clips=[]
    rig.animation_data.action=actions['Idle'];rig.animation_data.action_slot=actions['Idle'].slots[0];scene.frame_set(0);rest={b.name:b.matrix_basis.copy() for b in rig.pose.bones};rig.animation_data.action=None
    eating=bpy.data.actions.new(KEY+' Cannibalize');rig.animation_data.action=eating
    for frame in range(41):
        scene.frame_set(frame)
        for bone in rig.pose.bones:bone.matrix_basis=rest[bone.name]
        chew=math.sin(frame/40*math.tau)
        for name,angle in [('hips',.55),('spine',.25+.04*chew),('ribs',.1),('head',.12*chew),('upper_arm.L',-.45+.12*chew),('upper_arm.R',-.45-.12*chew),('forearm.L',-.4),('forearm.R',-.4)]:
            bone=rig.pose.bones[name];basis=bone.bone.matrix_local.to_quaternion();bone.rotation_mode='QUATERNION';bone.rotation_quaternion=bone.rotation_quaternion@basis.inverted()@Quaternion((1,0,0),angle)@basis
        bpy.context.view_layer.update()
        for bone in rig.pose.bones:
            bone.keyframe_insert(data_path='location',frame=frame);bone.keyframe_insert(data_path='rotation_quaternion' if bone.rotation_mode=='QUATERNION' else 'rotation_euler',frame=frame);bone.keyframe_insert(data_path='scale',frame=frame)
    actions['Cannibalize']=eating;rig.animation_data.action=None
    for name,_ in CLIPS+[('Cannibalize',None)]:
        action=actions[name];action.name=KEY+' '+name;start,end=action.frame_range;rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];rig.animation_data.action=None
        track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,0,action);strip.action_frame_start=start;strip.action_frame_end=end;strip.frame_start=0;strip.frame_end=end-start;clips.append({'name':name,'frames':max(1,round((end-start)/scene.render.fps*12))})
    bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    model='Assets/Models/'+KEY+'.glb';bpy.ops.export_scene.gltf(filepath=str(SAMPLE/model),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_optimize_animation_size=False,export_extras=False);generated.append(model)
    texture='Assets/Textures/'+KEY+'_base.png';(SAMPLE/texture).write_bytes((SOURCE/'new_thin_zombie.png').read_bytes());generated.append(texture)
    material='Assets/Materials/'+KEY+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':'Thin Revenant ghoul','shader':'pbr','base_color':[1,1,1,1],'base_color_texture':texture,'metallic':0,'roughness':.85,'double_sided':True}));generated.append(material)
    catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());catalog[KEY]={'material':material,'parts':[{'name':KEY,'mesh':model,'pivot':[0,0,0]}],'animations':clips,'size':size,'realistic':True,'attackEvent':.5};catalog[KEY+'Wood']={**catalog[KEY],'workAnimation':True,'workClip':4};catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')
    license_text='''Thin Zombie / RealGhoul
Author: Rosswet Mobile; submitted to OpenGameArt by dogchicken.
https://opengameart.org/content/thin-zombie-awake-zombie-asset
Creative Commons Attribution 3.0 Unported (CC-BY-3.0).
https://creativecommons.org/licenses/by/3.0/
MEngine adaptations by MiYu: normalized transforms and scale, four-weight skinning,
sampled IK animations, authored Cannibalize clip, GLB export and native model portraits.
Derived files: RealGhoul.glb, RealGhoul_base.png, RealGhoul.mmat and the
RealGhoul portrait in Assets/Art/unit-portraits.png.
Original model, texture, archive and attribution page: SourceAssets/ghoul.
Source and generated SHA-256: ghoul-sources.json.
Rebuild: Blender 4.5.9 with scripts/import-frost-ghoul.py.
'''
    for folder in ['Licenses','Assets/Licenses']:
        relative=folder+'/Rosswet-Ghoul.txt';(SAMPLE/relative).write_bytes(license_text.encode());generated.append(relative)
    manifest['models']={KEY:{'triangles':len(mesh.data.polygons),'bones':len(rig.data.bones),'clips':clips,'size':size}};manifest['generated']=[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in generated];manifest_path.write_text(json.dumps(manifest,indent=2)+'\n');print('Imported',KEY,manifest['models'][KEY],flush=True)

if __name__=='__main__':main()

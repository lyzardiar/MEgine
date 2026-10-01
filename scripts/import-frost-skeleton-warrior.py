"""Author: MiYu. Retarget licensed sword and shield actions to the anatomical skeleton."""
import bpy, math, json, hashlib, importlib.util, urllib.request
import numpy as np
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion
ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';KEY='RealSkeletonWarrior'
manifest_path=SAMPLE/'skeleton-warrior-sources.json';manifest=json.loads(manifest_path.read_text());generated=[]
for entry in manifest['sources']+manifest['inputs']:
    path=SAMPLE/entry['file']
    if not path.exists():
        data=urllib.request.urlopen(entry['url'],timeout=90).read()
        assert hashlib.sha256(data).hexdigest()==entry['sha256'];path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'],entry['file']
spec=importlib.util.spec_from_file_location('humans',ROOT/'scripts/import-frost-humans.py');humans=importlib.util.module_from_spec(spec);spec.loader.exec_module(humans)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SAMPLE/'Assets/Models/SkeletonBody.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
# Bake imported object normalization into the rest rig and mesh before retargeting.
mesh.data.transform(mesh.matrix_world);mesh.parent=None;mesh.matrix_world=Matrix.Identity(4)
rig.data.transform(rig.matrix_world);rig.matrix_world=Matrix.Identity(4);mesh.parent=rig
weighted={mesh.vertex_groups[g.group].name for v in mesh.data.vertices for g in v.groups if g.weight>0}
bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for b in rig.data.edit_bones:
    if b.name not in weighted:continue
    p=b.parent
    while p and p.name not in weighted:p=p.parent
    b.use_connect=False;b.parent=p
for b in list(rig.data.edit_bones):
    if b.name not in weighted:rig.data.edit_bones.remove(b)
eb=rig.data.edit_bones;eb['PELVIS'].parent=None;eb['HEAD'].parent=eb['VERTEBRAE_C1(atlas)']
for side in ['L','R']:
    for name,parent in [('CLAVICLE','STERNUM'),('SCAPULA','CLAVICLE'),('HUMERUS','CLAVICLE'),('ULNA','HUMERUS'),('RADIUS','ULNA'),('HAND','ULNA'),('FEMUR','PELVIS'),('TIBIA','FEMUR'),('FOOT','TIBIA')]:eb[name+'.'+side].parent=eb[parent+'.'+side] if parent not in ['STERNUM','PELVIS'] else eb[parent]
bpy.ops.object.mode_set(mode='OBJECT')
rest={b.name:b.matrix_local.copy() for b in rig.data.bones};ordered=sorted(rig.data.bones,key=lambda b:len(b.parent_recursive))
old=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(SAMPLE/'Assets/Models/RealFootman.glb'))
src=next(o for o in bpy.data.objects if o not in old and o.type=='ARMATURE');src.animation_data_clear();src.animation_data_create()
definition=json.loads((SAMPLE/'human-sources.json').read_text())['models']['RealFootman']
actions=definition['animations']
sr={b.name:src.matrix_world@b.matrix_local for b in src.data.bones};sp=lambda n:sr[n].translation
weapon_scale=1.05;equipment=[];weapon_meshes=[]
for part,hand in [(definition['parts'][2],'R'),(definition['parts'][3],'L')]:
    name=part['bone'];objects=humans.import_dae(part['mesh']);objects=[o for o in objects if o.type=='MESH']
    placement=Matrix.Translation(rest['HAND.'+hand].translation-sp('hand_'+hand)*weapon_scale)@Matrix.Scale(weapon_scale,4)@sr[name]
    bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT');bone=rig.data.edit_bones.new(name);bone.matrix=sr[name].normalized();bone.head=rest['HAND.'+hand].translation+(sp(name)-sp('hand_'+hand))*weapon_scale;bone.tail=bone.head+Vector((0,0,.2));bone.parent=rig.data.edit_bones['HAND.'+hand];bpy.ops.object.mode_set(mode='OBJECT')
    for obj in objects:
        obj.data.transform(placement@obj.matrix_world);obj.parent=rig;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4);obj.vertex_groups.clear();obj.vertex_groups.new(name=name).add(list(range(len(obj.data.vertices))),1,'REPLACE');obj.modifiers.clear();obj.modifiers.new('Equipment attachment','ARMATURE').object=rig
    equipment.append((part,hand,objects));weapon_meshes.extend(objects)
rest={b.name:b.matrix_local.copy() for b in rig.data.bones};ordered=sorted(rig.data.bones,key=lambda b:len(b.parent_recursive))
mapping={'PELVIS':'hip','HEAD':'head','JAW':'head'}
for b in rig.data.bones:
    if b.name.startswith('VERTEBRAE_L'):mapping[b.name]='spine'
    if b.name.startswith('VERTEBRAE_T'):mapping[b.name]='spine1' if int(b.name.split('_T')[1])>=7 else 'chest'
    if b.name.startswith('VERTEBRAE_C'):mapping[b.name]='neck'
for side in ['L','R']:
    for name,s in [('HUMERUS','arm'),('ULNA','forearm'),('HAND','hand'),('FEMUR','thigh'),('TIBIA','leg'),('FOOT','foot')]:mapping[name+'.'+side]=s+'_'+side
correction={n:Quaternion() for n in mapping}
for side in ['L','R']:
    for a,b,c,d in [('HUMERUS','ULNA','arm','forearm'),('ULNA','HAND','forearm','hand'),('FEMUR','TIBIA','thigh','leg'),('TIBIA','FOOT','leg','foot')]:correction[a+'.'+side]=(rest[b+'.'+side].translation-rest[a+'.'+side].translation).rotation_difference(sp(d+'_'+side)-sp(c+'_'+side))
    # Match the palm direction using the middle-finger base.
    correction['HAND.'+side]=(rest['FING_MID_A.'+side].translation-rest['HAND.'+side].translation).rotation_difference(sp('finger_'+side)-sp('hand_'+side))
    correction['FOOT.'+side]=(rig.data.bones['FOOT.'+side].tail_local-rest['FOOT.'+side].translation).rotation_difference((src.matrix_world@src.data.bones['foot_'+side].tail_local)-sp('foot_'+side))
rig.animation_data_create();scene=bpy.context.scene;scene.render.fps=30
scale=rest['PELVIS'].translation.z/sp('hip').z
clips=[]
for label,path in actions.items():
    added=humans.import_dae(path);animated=max((o for o in added if o.type=='ARMATURE'),key=lambda o:len(o.data.bones));start,end=animated.animation_data.action.frame_range
    dest=bpy.data.actions.new('Anatomical '+label);rig.animation_data.action=dest
    for frame in range(int(start),int(end)+1):
        scene.frame_set(frame);bpy.context.view_layer.update();poses={}
        source_pose={b.name:src.matrix_world@animated.matrix_world@animated.pose.bones[b.name].matrix@animated.data.bones[b.name].matrix_local.inverted()@b.matrix_local if b.name in animated.pose.bones else sr[b.name] for b in src.data.bones}
        for b in ordered:
            n=b.name;r=rest[n];parent=b.parent;pr=rest[parent.name] if parent else None;pp=poses[parent.name] if parent else None
            if n in mapping:
                s=mapping[n];delta=source_pose[s].to_quaternion()@sr[s].to_quaternion().inverted();q=delta@correction[n]@r.to_quaternion()
            else:q=(pp.to_quaternion()@pr.to_quaternion().inverted()@r.to_quaternion()) if parent else r.to_quaternion()
            if n.startswith('FING_'):
                direction=rig.data.bones[n].tail_local-r.translation;axis=direction.cross(Vector((0,-1,0))).normalized();angle=.35 if 'THUMB' in n else .65
                q=q@Quaternion(r.to_quaternion().inverted()@axis,angle)
            p=pp@(pr.inverted()@r.translation) if parent else r.translation+source_pose['hip'].translation*scale-sp('hip')*scale
            poses[n]=Matrix.LocRotScale(p,q,Vector((1,1,1)))
        for part,hand,objects in equipment:
            n=part['bone'];poses[n]=Matrix.LocRotScale(poses['HAND.'+hand].translation+(source_pose[n].translation-source_pose['hand_'+hand].translation)*weapon_scale,source_pose[n].to_quaternion()@sr[n].to_quaternion().inverted()@rest[n].to_quaternion(),Vector((1,1,1)))
        for grounding in [False,True]:
            if grounding:
                bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();low=min((obj.matrix_world@v.co).z for obj in [mesh,*weapon_meshes] for v in obj.evaluated_get(deps).data.vertices)
                for pose in poses.values():pose.translation.z-=low
            for b in ordered:
                pb=rig.pose.bones[b.name];pb.rotation_mode='QUATERNION';pb.matrix_basis=b.convert_local_to_pose(poses[b.name],b.matrix_local,parent_matrix=poses[b.parent.name] if b.parent else Matrix.Identity(4),parent_matrix_local=b.parent.matrix_local if b.parent else Matrix.Identity(4),invert=True)
                if grounding:
                    pb.keyframe_insert('location',frame=frame-start);pb.keyframe_insert('rotation_quaternion',frame=frame-start);pb.keyframe_insert('scale',frame=frame-start)
    for curve in dest.fcurves:
        for point in curve.keyframe_points:point.interpolation='LINEAR'
    rig.animation_data.action=None;track=rig.animation_data.nla_tracks.new();track.name=label;strip=track.strips.new(label,0,dest);clips.append({'name':label,'frames':round((end-start)/scene.render.fps*12)})
    for obj in added:bpy.data.objects.remove(obj,do_unlink=True)
for o in list(bpy.data.objects):
    if o not in [rig,mesh,*weapon_meshes]:bpy.data.objects.remove(o,do_unlink=True)
tiles=[]
for index,path in enumerate(['Assets/Textures/SkeletonBody_ao.png',*['SourceAssets/0ad/'+part['base'] for part,hand,objects in equipment]]):
    width=1024 if index==0 else 512;image=bpy.data.images.load(str(SAMPLE/path),check_existing=False);image.scale(width,1024);pixels=np.empty(width*1024*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape((1024,width,4))
    if index==0:pixels[:,:,:3]*=np.array([.7,.66,.55])
    if index==2:pixels[:,:,:3]*=pixels[:,:,3:4]+(1-pixels[:,:,3:4])*np.array([.3,.22,.36])
    pixels[:,:,3]=1;tiles.append(pixels)
texture='Assets/Textures/'+KEY+'_base.png';atlas=bpy.data.images.new(KEY,width=2048,height=1024,alpha=False);atlas.pixels.foreach_set(np.concatenate(tiles,axis=1).ravel());atlas.filepath_raw=str(SAMPLE/texture);atlas.file_format='PNG';atlas.save();generated.append(texture)
for index,objects in enumerate([[mesh],equipment[0][2],equipment[1][2]]):
    for obj in objects:
        obj.data.uv_layers.active.name='UVMap'
        for uv in obj.data.uv_layers.active.data:uv.uv.x=min(.9995,max(.0005,uv.uv.x))*(.5 if index==0 else .25)+[0,.5,.75][index];uv.uv.y=min(.9995,max(.0005,uv.uv.y))
bpy.ops.object.select_all(action='DESELECT')
for obj in [mesh,*weapon_meshes]:obj.select_set(True)
bpy.context.view_layer.objects.active=mesh;bpy.ops.object.join();mesh.name=KEY;bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False);modifier=mesh.modifiers.new('Stable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name)
for face in mesh.data.polygons:face.material_index=0
mesh.data.materials.clear();mat=bpy.data.materials.new(KEY);mat.use_nodes=True;mesh.data.materials.append(mat);tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=atlas;mat.node_tree.links.new(tex.outputs['Color'],mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
rig.select_set(True);bpy.context.view_layer.objects.active=rig
model='Assets/Models/'+KEY+'.glb';bpy.ops.export_scene.gltf(filepath=str(SAMPLE/model),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_optimize_animation_size=False)
for track in rig.animation_data.nla_tracks:track.mute=track.name!='Idle'
scene.frame_set(0);bpy.context.view_layer.update();evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());points=[evaluated.matrix_world@v.co for v in evaluated.data.vertices];size=[max(p[i] for p in points)-min(p[i] for p in points) for i in [0,2,1]]
material='Assets/Materials/'+KEY+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':KEY,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':texture,'metallic':0,'roughness':.82,'double_sided':True}));generated.extend([model,material])
catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());catalog[KEY]={'material':material,'parts':[{'name':KEY,'mesh':model,'pivot':[0,0,0]}],'animations':clips,'size':size,'realistic':True,'attackEvent':.45};catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')
manifest['model']={'key':KEY,'triangles':len(mesh.data.polygons),'bones':len(rig.data.bones),'clips':clips,'size':size};manifest['generated']=[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in generated];manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
print('Imported',KEY,manifest['model'])


license_text="""Anatomical skeleton warrior / RealSkeletonWarrior
Body: Gord Goodwin, Skeleton with rig, CC0-1.0.
https://opengameart.org/content/skeleton-with-rig
Rig reference, sword/shield and melee actions: Wildfire Games, 0 A.D., CC-BY-SA-3.0.
https://github.com/0ad/0ad/tree/61a3b9507d974084e6badb88a0826bd89a6d5b8b/binaries/data/mods/public/art
https://creativecommons.org/licenses/by-sa/3.0/
MEngine adaptations by MiYu: anatomical FK hierarchy, pose retargeting,
finger grip, ground contact, equipment attachment, texture atlas and portrait.
These adaptations are CC-BY-SA-3.0.
Derived files: Assets/Models/RealSkeletonWarrior.glb,
Assets/Textures/RealSkeletonWarrior_base.png, Assets/Materials/RealSkeletonWarrior.mmat
and RealSkeletonWarrior portrait in Assets/Art/unit-portraits.png.
Original sources: SourceAssets/anatomical-skeleton and SourceAssets/0ad.
Source URLs, dependency manifests and hashes: skeleton-warrior-sources.json.
Rebuild: scripts/import-frost-skeleton-warrior.py using Blender 4.5.9.
"""
for folder in ['Licenses','Assets/Licenses']:(SAMPLE/folder/'Anatomical-Skeleton-Warrior.txt').write_bytes(license_text.encode())

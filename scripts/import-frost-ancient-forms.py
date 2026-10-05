"""Author: MiYu. Skin the existing Ancient bodies and crowns to the attributed Entangled Roots rig."""
import bpy
import bmesh
import hashlib
import json
from pathlib import Path
from mathutils import Matrix, Vector, Euler
from mathutils.kdtree import KDTree

ROOT=Path(__file__).resolve().parents[1]
SAMPLE=ROOT/'samples/frostbound-realms'
catalog_path=SAMPLE/'model-catalog.json'
catalog=json.loads(catalog_path.read_text(encoding='utf-8'))
sources=[]
generated=[]
models={}

for tier in range(1,4):
    key='WildwoodHall'+(str(tier) if tier>1 else '')
    variant=key+'Uprooted'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SAMPLE/'Assets/Models/RealTreant.glb'))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    body=next(o for o in bpy.data.objects if o.type=='MESH' and o.vertex_groups)
    rig.data.pose_position='REST'
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(SAMPLE/catalog[key]['parts'][0]['mesh']))
    mesh=next(o for o in bpy.data.objects if o not in before and o.type=='MESH')
    uv=mesh.data.uv_layers.active
    foundation={v for face in mesh.data.polygons if all(uv.data[i].uv.x>2/3 for i in face.loop_indices) for v in face.vertices}
    tree_body={v for face in mesh.data.polygons if all(uv.data[i].uv.x<1/3 for i in face.loop_indices) for v in face.vertices}
    source_points=[body.matrix_world@v.co for v in body.data.vertices]
    target_points=[mesh.matrix_world@mesh.data.vertices[i].co for i in tree_body]
    low=lambda points:Vector([min(p[i] for p in points) for i in range(3)])
    high=lambda points:Vector([max(p[i] for p in points) for i in range(3)])
    lo,hi=low(source_points),high(source_points)
    target_lo,target_hi=low(target_points),high(target_points)
    scale=Vector([(target_hi[i]-target_lo[i])/(hi[i]-lo[i]) for i in range(3)])
    offset=target_lo-Vector([lo[i]*scale[i] for i in range(3)])
    affine=Matrix.Translation(offset)@Matrix.Diagonal((*scale,1))
    rig.matrix_world=affine@rig.matrix_world
    tree=KDTree(len(source_points))
    for i,p in enumerate(source_points):tree.insert(affine@p,i)
    tree.balance()
    groups={bone.name:mesh.vertex_groups.new(name=bone.name) for bone in rig.data.bones}
    for vertex in mesh.data.vertices:
        if vertex.index in foundation:continue
        if vertex.index in tree_body:
            _,i,_=tree.find(mesh.matrix_world@vertex.co)
            for group in body.data.vertices[i].groups:
                name=body.vertex_groups[group.group].name
                if name in groups:groups[name].add([vertex.index],group.weight,'REPLACE')
        else:
            groups['Spine Upper'].add([vertex.index],1,'REPLACE')
    bm=bmesh.new();bm.from_mesh(mesh.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.verts[i] for i in foundation],context='VERTS')
    bm.to_mesh(mesh.data);bm.free()
    modifier=mesh.modifiers.new('Ancient skeletal forms','ARMATURE');modifier.object=rig
    mesh.parent=rig;mesh.matrix_parent_inverse=rig.matrix_world.inverted()
    bpy.data.objects.remove(body,do_unlink=True)
    rig.data.pose_position='POSE'
    scene=bpy.context.scene;scene.render.fps=24
    rig.animation_data.action=None
    for name,frames in [('Uproot',60),('Root',60),('EatTree',20)]:
        action=bpy.data.actions.new(name);rig.animation_data.action=action
        for bone in rig.pose.bones:
            bone.location=(0,0,0);bone.rotation_mode='QUATERNION';bone.rotation_quaternion=(1,0,0,0);bone.scale=(1,1,1)
        spine=rig.pose.bones['Spine Base']
        for frame,height in [(0,0),(frames//2,.45 if name!='EatTree' else -.18),(frames,0)]:
            spine.location=spine.bone.matrix_local.to_3x3().inverted()@rig.matrix_world.to_3x3().inverted()@Vector((0,0,height));spine.keyframe_insert(data_path='location',frame=frame)
        neck=rig.pose.bones['Neck'];neck.rotation_mode='QUATERNION'
        for frame,angle in [(0,0),(frames//2,-.28 if name=='EatTree' else .07),(frames,0)]:
            neck.rotation_quaternion=Euler((angle,0,0)).to_quaternion();neck.keyframe_insert(data_path='rotation_quaternion',frame=frame)
        rig.animation_data.action=None
        track=rig.animation_data.nla_tracks.new();track.name=name
        strip=track.strips.new(name,0,action);strip.action_frame_start=0;strip.action_frame_end=frames;strip.frame_start=0;strip.frame_end=frames;track.mute=True
    for bone in rig.pose.bones:
        bone.location=(0,0,0);bone.rotation_mode='QUATERNION';bone.rotation_quaternion=(1,0,0,0);bone.scale=(1,1,1)
    bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    model='Assets/Models/'+variant+'.glb'
    bpy.ops.export_scene.gltf(filepath=str(SAMPLE/model),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_optimize_animation_size=False)
    import struct
    data=(SAMPLE/model).read_bytes();length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length])
    clips=[]
    for animation in doc.get('animations',[]):
        duration=max(doc['accessors'][sampler['input']]['max'][0] for sampler in animation['samplers'])
        clips.append({'name':animation['name'],'frames':max(1,round(duration*12))})
    assert {clip['name'] for clip in clips}=={'Idle','Walk','Attack','Death','Uproot','Root','EatTree'}
    catalog[variant]={**catalog[key],'parts':[{'name':variant,'mesh':model,'pivot':[0,0,0]}],'animations':clips,'attackEvent':.5,'ancientForm':True}
    models[variant]={'tier':tier,'bones':len(rig.data.bones),'skinJoints':len(doc['skins'][0]['joints']),'vertices':len(mesh.data.vertices),'triangles':sum(len(face.vertices)-2 for face in mesh.data.polygons),'clips':clips,'foundationRemoved':True,'crownBone':'Spine Upper'}
    generated.append({'file':model,'sha256':hashlib.sha256(data).hexdigest()})
    print('Exported',variant,models[variant],flush=True)
for file in ['Assets/Models/RealTreant.glb',*[catalog[key]['parts'][0]['mesh'] for key in ['WildwoodHall','WildwoodHall2','WildwoodHall3']]]:
    sources.append({'file':file,'sha256':hashlib.sha256((SAMPLE/file).read_bytes()).hexdigest()})
catalog_path.write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8')
(SAMPLE/'ancient-form-sources.json').write_text(json.dumps({'author':'MiYu','generator':'scripts/import-frost-ancient-forms.py','attributionManifests':['treant-sources.json','wildwood-sources.json'],'licenses':['CC-BY-3.0','CC0-1.0'],'sources':sources,'models':models,'generated':generated,'animationAuthorship':'Idle/Walk/Attack/Death are from Entangled Roots. Uproot/Root/EatTree are project authored skeletal clips.'},indent=2)+'\n',encoding='utf-8')

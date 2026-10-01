"""Author: MiYu. Import piacenti's textured Troll Mauler rig and author heavy undead combat poses."""
import bpy, hashlib, json, math, urllib.request
import numpy as np
from pathlib import Path
from mathutils import Matrix, Quaternion, Vector

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';KEY='RealAbomination'

def main():
    manifest_path=SAMPLE/'abomination-sources.json';manifest=json.loads(manifest_path.read_text());generated=[]
    for entry in manifest['sources']:
        path=SAMPLE/entry['file']
        if not path.exists():path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(urllib.request.urlopen(entry['url'],timeout=120).read())
        assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'],entry['file']
    bpy.ops.wm.open_mainfile(filepath=str(SAMPLE/'SourceAssets/abomination/troll.blend'),load_ui=False,use_scripts=False)
    scene=bpy.context.scene;rig=bpy.data.objects['Armature'];parts=[bpy.data.objects[name] for name in ['med','cloth','eye med']];rig.data.pose_position='REST';bpy.context.view_layer.update()
    atlas_material=bpy.data.materials.new(KEY+' atlas')
    for part,offset,scale in zip(parts,[(0,0),(2/3,0),(2/3,.5)],[(2/3,1),(1/3,.5),(1/6,.25)]):
        transform=rig.matrix_world.inverted()@part.matrix_world;part.data.transform(transform);part.matrix_parent_inverse=Matrix.Identity(4);part.matrix_basis=Matrix.Identity(4)
        if transform.determinant()<0:part.data.flip_normals()
        for uv in part.data.uv_layers.active.data:uv.uv=(uv.uv.x*scale[0]+offset[0],uv.uv.y*scale[1]+offset[1])
        for group in list(part.vertex_groups):
            if group.name not in rig.data.bones:part.vertex_groups.remove(group)
        part.data.materials.clear();part.data.materials.append(atlas_material)
        for face in part.data.polygons:face.material_index=0
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:part.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();mesh=bpy.context.object;mesh.name=KEY
    bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False);modifier=mesh.modifiers.new('Stable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name)
    rig.data.pose_position='POSE';rig.animation_data_clear();rig.animation_data_create()
    for bone in rig.pose.bones:
        for constraint in list(bone.constraints):bone.constraints.remove(constraint)
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT');roots=[bone for bone in rig.data.edit_bones if bone.parent is None];root=rig.data.edit_bones.new('UndeadRoot');root.head=(0,0,0);root.tail=(0,1,0)
    for bone in roots:bone.parent=root
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone in rig.data.bones:bone.use_inherit_rotation=True
    for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update();evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());points=[evaluated.matrix_world@v.co for v in evaluated.data.vertices];low=min(p.z for p in points);factor=3.3/(max(p.z for p in points)-low);rig.scale*=factor;rig.location*=factor;rig.location.z-=low*factor
    def turn(name,axis,angle):
        bone=rig.pose.bones[name];rest=bone.bone.matrix_local.to_quaternion();bone.rotation_mode='QUATERNION';bone.rotation_quaternion=rest.inverted()@Quaternion(axis,angle)@rest
    actions={};clips=[]
    for name,last in [('Idle',40),('Walk',40),('Attack',32),('Death',40)]:
        action=bpy.data.actions.new(KEY+' '+name);rig.animation_data.action=action
        for frame in range(last+1):
            scene.frame_set(frame)
            for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
            t=frame/last
            if name=='Idle':
                turn('Bone.001',(1,0,0),.025*math.sin(t*math.tau));turn('Bone.003',(0,0,1),.025*math.sin(t*math.tau));turn('arm.L',(1,0,0),.03*math.sin(t*math.tau));turn('arm.R',(1,0,0),-.03*math.sin(t*math.tau))
            elif name=='Walk':
                cycle=math.sin(t*math.tau)
                turn('Bone.001',(0,0,1),.06*cycle);turn('arm.L',(1,0,0),-.18*cycle);turn('arm.R',(1,0,0),.18*cycle)
                for side,phase in [('L',cycle),('R',-cycle)]:
                    turn('thigh.'+side,(1,0,0),.4*phase);turn('shin.'+side,(1,0,0),-.35*max(0,phase));turn('foot.'+side,(1,0,0),-.1*phase)
            elif name=='Attack':
                wind=math.sin(min(t/.45,1)*math.pi/2) if t<.45 else max(0,1-(t-.45)/.55)
                strike=math.sin((t-.3)/.45*math.pi) if .3<t<.75 else 0
                turn('Bone.001',(1,0,0),-.1*wind+.3*strike);turn('Bone.002',(0,0,1),-.22*wind);turn('arm.R',(1,0,0),-1.5*wind+.45*strike);turn('forearm.R',(1,0,0),-.55*wind);turn('arm.L',(1,0,0),-.25*wind)
            else:
                fall=min(1,max(0,(t-.08)/.72));ease=fall*fall*(3-2*fall)
                turn('UndeadRoot',(1,0,0),1.57*ease);turn('Bone.001',(1,0,0),.15*math.sin(fall*math.pi));turn('arm.L',(0,0,1),.1*ease);turn('arm.R',(0,0,1),-.1*ease)
            if name in ['Walk','Death']:
                bpy.context.view_layer.update();obj=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());bottom=min((obj.matrix_world@v.co).z for v in obj.data.vertices);root=rig.pose.bones['UndeadRoot'];root.location+=root.bone.matrix_local.to_3x3().inverted()@Vector((0,0,-bottom/factor))
            for bone in rig.pose.bones:
                bone.keyframe_insert(data_path='location',frame=frame);bone.keyframe_insert(data_path='rotation_quaternion',frame=frame);bone.keyframe_insert(data_path='scale',frame=frame)
        for curve in action.fcurves:
            for key in curve.keyframe_points:key.interpolation='LINEAR'
        actions[name]=action;rig.animation_data.action=None
    rig.animation_data.action=actions['Idle'];scene.frame_set(0);bpy.context.view_layer.update();obj=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());points=[obj.matrix_world@v.co for v in obj.data.vertices];size=[max(p[i] for p in points)-min(p[i] for p in points) for i in [0,2,1]];rig.animation_data.action=None
    for name in ['Idle','Walk','Attack','Death']:
        action=actions[name];start,end=action.frame_range;track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,0,action);strip.action_frame_start=start;strip.action_frame_end=end;strip.frame_start=0;strip.frame_end=end-start;clips.append({'name':name,'frames':max(1,round((end-start)/scene.render.fps*12))})
    mesh.select_set(True);model='Assets/Models/'+KEY+'.glb';bpy.ops.export_scene.gltf(filepath=str(SAMPLE/model),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_optimize_animation_size=False,export_extras=False);generated.append(model)
    for channel,names in [('base',['troll_baseTexBaked.png','cloth uv.png','Material Diffuse Color']),('normal',['troll_normals.png','cloth uv_NRM.png',None])]:
        pixels=np.ones((2048,3072,4),dtype=np.float32);pixels[:,:,:3]=[.5,.5,1] if channel=='normal' else [.18,.12,.1]
        for image_name,(x,y,n) in zip(names,[(0,0,2048),(2048,0,1024),(2048,1024,512)]):
            if image_name:
                image=bpy.data.images[image_name];image.scale(n,n);values=np.empty(n*n*4,dtype=np.float32);image.pixels.foreach_get(values);pixels[y:y+n,x:x+n]=values.reshape(n,n,4)
        atlas=bpy.data.images.new(KEY+' '+channel,width=3072,height=2048);atlas.colorspace_settings.name='Non-Color' if channel=='normal' else 'sRGB';atlas.pixels.foreach_set(pixels.ravel());relative='Assets/Textures/'+KEY+'_'+channel+'.png';atlas.filepath_raw=str(SAMPLE/relative);atlas.file_format='PNG';atlas.save();generated.append(relative)
    material='Assets/Materials/'+KEY+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':'Revenant abomination','shader':'pbr','base_color':[1,1,1,1],'base_color_texture':'Assets/Textures/'+KEY+'_base.png','normal_texture':'Assets/Textures/'+KEY+'_normal.png','normal_scale':.65,'metallic':0,'roughness':.85,'double_sided':True}));generated.append(material)
    catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());catalog[KEY]={'material':material,'parts':[{'name':KEY,'mesh':model,'pivot':[0,0,0]}],'animations':clips,'size':size,'realistic':True,'attackEvent':.5};catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')
    license_text='Troll Mauler / RealAbomination\nAuthor: piacenti\n'+manifest['page']+'\nCC-BY-3.0\n'+manifest['licenseUrl']+'\nMEngine adaptations by MiYu: normalized rig, authored Idle/Walk/Attack/Death,\nbody/cloth/eye texture atlases, four-weight skinning, GLB and native unit portrait.\nDerived files: RealAbomination.glb, RealAbomination_base.png, RealAbomination_normal.png,\nRealAbomination.mmat and the RealAbomination portrait in Assets/Art/unit-portraits.png.\nSource: SourceAssets/abomination/troll.blend. Hashes: abomination-sources.json.\nRebuild: Blender 4.5.9 with scripts/import-frost-abomination.py.\n'
    for folder in ['Licenses','Assets/Licenses']:
        relative=folder+'/piacenti-Abomination.txt';(SAMPLE/relative).write_bytes(license_text.encode());generated.append(relative)
    manifest['models']={KEY:{'triangles':len(mesh.data.polygons),'bones':len(rig.data.bones),'clips':clips,'size':size}};manifest['generated']=[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in generated];manifest_path.write_text(json.dumps(manifest,indent=2)+'\n');print('Imported',KEY,manifest['models'][KEY],flush=True)

if __name__=='__main__':main()

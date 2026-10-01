"""Author: MiYu. Fit CC0 anatomical extremities to a licensed 0 A.D. robed caster."""
import bpy, bmesh, hashlib, importlib.util, json
import numpy as np
from pathlib import Path
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';FOLDER=SAMPLE/'SourceAssets/necromancer';FOLDER.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('humans',ROOT/'scripts/import-frost-humans.py');humans=importlib.util.module_from_spec(spec);spec.loader.exec_module(humans)
bpy.ops.wm.read_factory_settings(use_empty=True)
objects=humans.import_dae('meshes/skeletal/new/m_dress_sleeves.dae');rig=next(o for o in objects if o.type=='ARMATURE');robe=next(o for o in objects if o.type=='MESH');rig.data.pose_position='REST';rig.animation_data_clear()
matrices=humans.attachment_matrices('meshes/skeletal/new/m_dress_sleeves.dae');robe.data.transform(robe.matrix_world);robe.parent=rig;robe.matrix_parent_inverse=Matrix.Identity(4);robe.matrix_basis=Matrix.Identity(4)
# Remove the source neck, hands and shoes, including their transition triangles.
skin_groups={'neck','head'}|{n+'_'+s for n in ['hand','finger','fingertip','foot'] for s in ['L','R']}
skin_vertices={v.index for v in robe.data.vertices if robe.vertex_groups[max(v.groups,key=lambda g:g.weight).group].name in skin_groups}
bm=bmesh.new();bm.from_mesh(robe.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index in skin_vertices],context='VERTS');bm.to_mesh(robe.data);bm.free()
robe_vertices=len(robe.data.vertices)
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(SAMPLE/'Assets/Models/SkeletonBody.glb'));anatomy=max((o for o in bpy.context.scene.objects if o not in before and o.type=='MESH'),key=lambda o:len(o.data.vertices));anatomy_rig=next(o for o in bpy.data.objects if o not in before and o.type=='ARMATURE')
ar={b.name:anatomy_rig.matrix_world@b.matrix_local for b in anatomy_rig.data.bones};hr={b.name:rig.matrix_world@b.matrix_local for b in rig.data.bones}
def region(name):
    if name in ['HEAD','JAW','HEAD.001'] or name.startswith('VERTEBRAE_C'):return 'head'
    if name.endswith(('.L','.R')):
        if name.split('.')[0] in ['ULNA','RADIUS']:return 'forearm_'+name[-1]
        if name.split('.')[0] in ['HAND','PINKY_PALM','THUMB_PALM'] or name.startswith('FING_'):return 'hand_'+name[-1]
        if name.startswith(('FOOT.','TOE_')):return 'foot_'+name[-1]
    return None
transforms={};head_scale=1.37;transforms['head']=Matrix.Translation(hr['head'].translation)@Matrix.Scale(head_scale,4)@Matrix.Translation(-ar['HEAD'].translation)
for side in ['L','R']:
    source=ar['HAND.'+side].translation;target=hr['hand_'+side].translation;sd=ar['FING_MID_A.'+side].translation-source;td=hr['finger_'+side].translation-target
    transforms['hand_'+side]=Matrix.Translation(target)@sd.rotation_difference(td).to_matrix().to_4x4()@Matrix.Scale(td.length/sd.length,4)@Matrix.Translation(-source)
    source=ar['ULNA.'+side].translation;target=hr['forearm_'+side].translation;sd=ar['HAND.'+side].translation-source;td=hr['hand_'+side].translation-target
    transforms['forearm_'+side]=Matrix.Translation(target)@sd.rotation_difference(td).to_matrix().to_4x4()@Matrix.Scale(td.length/sd.length,4)@Matrix.Translation(-source)
    source=ar['FOOT.'+side].translation;transforms['foot_'+side]=Matrix.Translation(hr['foot_'+side].translation)@Matrix.Scale(1.37,4)@Matrix.Translation(-source)
kept={};weights={};regions={}
for v in anatomy.data.vertices:
    original=[(anatomy.vertex_groups[g.group].name,g.weight) for g in v.groups]
    assert original,'Anatomical skin must have weights'
    dominant=max(original,key=lambda g:g[1])[0];r=region(dominant)
    if r is None:continue
    if r.startswith('forearm'):
        axis=ar['HAND.'+r[-1]].translation-ar['ULNA.'+r[-1]].translation
        if ((anatomy.matrix_world@v.co)-ar['ULNA.'+r[-1]].translation).dot(axis)/axis.length_squared<.8:continue
    kept[v.index]=transforms[r]@(anatomy.matrix_world@v.co);regions[v.index]=r;weights[v.index]={}
    for name,weight in original:
        if r=='head':bone='neck' if name.startswith('VERTEBRAE_C') else 'head'
        elif r.startswith('foot'):bone=r
        else:
            side=r[-1];bone='forearm_'+side if name.startswith(('ULNA.','RADIUS.')) else ('fingertip_' if name.startswith('FING_') and '_C.' in name else 'finger_' if name.startswith('FING_') else 'hand_')+side
        weights[v.index][bone]=weights[v.index].get(bone,0)+weight
for r in ['foot_L','foot_R']:
    low=min(p.z for i,p in kept.items() if regions[i]==r)
    for i,p in kept.items():
        if regions[i]==r:p.z-=low
# Preserve UVs while replacing anatomical weights with the corresponding caster joints.
for v in anatomy.data.vertices:
    if v.index in kept:v.co=kept[v.index]
anatomy.vertex_groups.clear()
for name in sorted({n for groups in weights.values() for n in groups}):anatomy.vertex_groups.new(name=name)
for i,groups in weights.items():
    for name,weight in groups.items():anatomy.vertex_groups[name].add([i],weight,'REPLACE')
bm=bmesh.new();bm.from_mesh(anatomy.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in kept],context='VERTS');bm.to_mesh(anatomy.data);bm.free()
anatomy.parent=rig;anatomy.matrix_parent_inverse=Matrix.Identity(4);anatomy.matrix_basis=Matrix.Identity(4);anatomy.modifiers.clear();anatomy.modifiers.new('Caster joints','ARMATURE').object=rig
parts=[(robe,'SourceAssets/0ad/textures/skins/skeletal/pers/robes_healer_01.png','robe'),(anatomy,'Assets/Textures/SkeletonBody_ao.png','bone')]
for path,texture,bone,style in [('meshes/props/helmet/old/hele_hood.dae','textures/skins/props/helmet/old/hele_hood_1.dds','prop-helmet','hood'),('meshes/props/m_staff.dae','textures/skins/structural/celt_struct_1.dds','prop-weapon_R','wood')]:
    added=humans.import_dae(path)
    for obj in [o for o in added if o.type=='MESH']:
        obj.data.transform(matrices[bone]@obj.matrix_world);obj.parent=rig;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4);obj.vertex_groups.clear();obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))),1,'REPLACE');obj.modifiers.clear();obj.modifiers.new('Caster attachment','ARMATURE').object=rig;parts.append((obj,'SourceAssets/0ad/'+texture,style))
        if style=='wood':
            tip=max((v.co for v in obj.data.vertices),key=lambda v:v.z);base=min((v.co for v in obj.data.vertices),key=lambda v:v.z);obj.data.transform(Matrix.Translation((tip-base).normalized()*.55))
assert len(parts)==4
# The staff's anatomical skull cap shares the body's bone texture and follows the staff socket.
staff=parts[-1][0];tip=max((v.co for v in staff.data.vertices),key=lambda v:v.z).copy();cap=anatomy.copy();cap.data=anatomy.data.copy();bpy.context.collection.objects.link(cap)
remove={v.index for v in cap.data.vertices if cap.vertex_groups[max(v.groups,key=lambda g:g.weight).group].name!='head'};bm=bmesh.new();bm.from_mesh(cap.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index in remove],context='VERTS');bm.to_mesh(cap.data);bm.free()
points=[v.co.copy() for v in cap.data.vertices];center=Vector([(max(p[i] for p in points)+min(p[i] for p in points))/2 for i in range(3)]);cap_scale=.38/(max(p.z for p in points)-min(p.z for p in points));cap.data.transform(Matrix.Translation(tip+Vector((0,0,.12)))@Matrix.Scale(cap_scale,4)@Matrix.Translation(-center));cap.vertex_groups.clear();cap.vertex_groups.new(name='prop-weapon_R').add(list(range(len(cap.data.vertices))),1,'REPLACE')
bpy.ops.object.select_all(action='DESELECT');anatomy.select_set(True);cap.select_set(True);bpy.context.view_layer.objects.active=anatomy;bpy.ops.object.join()
tiles=[]
for index,(obj,path,style) in enumerate(parts):
    image=bpy.data.images.load(str(SAMPLE/path),check_existing=False);image.alpha_mode='CHANNEL_PACKED';image.scale(1024,1024);pixels=np.empty(1024*1024*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape((1024,1024,4))
    if style=='bone':pixels[:,:,:3]*=np.array([.7,.66,.55])
    elif style=='robe':pixels[:,:,:3]*=pixels[:,:,3:4]*np.array([.32,.30,.36])+(1-pixels[:,:,3:4])*np.array([.22,.12,.27])
    elif style=='hood':pixels[:,:,:3]=pixels[:,:,:3].mean(axis=2,keepdims=True)*np.array([.29,.22,.34])
    pixels[:,:,3]=1;tiles.append(pixels)
    obj.data.uv_layers.active.name='UVMap'
    for uv in obj.data.uv_layers.active.data:uv.uv.x=(min(.9995,max(.0005,uv.uv.x))+index%2)/2;uv.uv.y=(min(.9995,max(.0005,uv.uv.y))+index//2)/2
atlas=bpy.data.images.new('Necromancer source',width=2048,height=2048,alpha=False);atlas.pixels.foreach_set(np.concatenate([np.concatenate(tiles[:2],axis=1),np.concatenate(tiles[2:],axis=1)],axis=0).ravel());atlas.filepath_raw=str(FOLDER/'body_base.png');atlas.file_format='PNG';atlas.save()
bpy.ops.object.select_all(action='DESELECT')
for obj,_,_ in parts:obj.select_set(True)
bpy.context.view_layer.objects.active=robe;bpy.ops.object.join();robe.name='Anatomical robed caster';bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False);robe.data.materials.clear()
rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.export_scene.gltf(filepath=str(FOLDER/'body.glb'),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=False)
source_manifest=json.loads((SAMPLE/'mage-sources.json').read_text());paths=['meshes/skeletal/new/m_dress_sleeves.dae','textures/skins/skeletal/pers/robes_healer_01.png','meshes/props/helmet/old/hele_hood.dae','textures/skins/props/helmet/old/hele_hood_1.dds','meshes/props/m_staff.dae','textures/skins/structural/celt_struct_1.dds','animation/biped/citizen/idle_relax_h_m.dae','animation/biped/citizen/walk_relax_h_m.dae','animation/biped/citizen/healing_m.dae','animation/biped/infantry/death_a.dae']
sources=[e for e in source_manifest['sources'] if e['file'] in ['SourceAssets/0ad/'+p for p in paths]];assert len(sources)==len(paths)
body_manifest=json.loads((SAMPLE/'anatomical-skeleton-sources.json').read_text());inputs=[e for e in body_manifest['generated'] if e['file'].endswith(('SkeletonBody.glb','SkeletonBody_ao.png'))];sources+=body_manifest['sources']
for entry in sources+inputs:assert hashlib.sha256((SAMPLE/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
derived=[{'file':p.relative_to(SAMPLE).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [FOLDER/'body.glb',FOLDER/'body_base.png']]
manifest={'author':'Gord Goodwin; Wildfire Games; MiYu assembly','license':'CC-BY-SA-3.0','sourceRoot':'SourceAssets','preparation':'scripts/prepare-frost-necromancer.py','generator':'scripts/import-frost-humans.py --manifest necromancer-sources.json','dependencies':['anatomical-skeleton-sources.json','mage-sources.json'],'preparationStats':{'garmentVertices':robe_vertices,'anatomicalVertices':len(kept),'removedHumanSkinVertices':len(skin_vertices)},'models':{'RealNecromancer':{'parts':[{'mesh':'necromancer/body.glb','attachmentSource':'0ad/meshes/skeletal/new/m_dress_sleeves.dae','base':'necromancer/body_base.png','bone':None,'tint':None}],'animations':{'Idle':'0ad/animation/biped/citizen/idle_relax_h_m.dae','Walk':'0ad/animation/biped/citizen/walk_relax_h_m.dae','Staff_Attack':'0ad/animation/biped/citizen/healing_m.dae','Death':'0ad/animation/biped/infantry/death_a.dae'},'height':3.3,'attackEvent':.25}},'sources':sources+derived}
manifest['inputs']=inputs;manifest['licenseUrl']='https://creativecommons.org/licenses/by-sa/3.0/';manifest['models']['RealNecromancer']['groundClips']=['Death']
(SAMPLE/'necromancer-sources.json').write_text(json.dumps(manifest,indent=2)+'\n')
license_text='''Anatomical robed necromancer / RealNecromancer
Body extremities and staff skull: Gord Goodwin, Skeleton with rig, CC0-1.0.
https://opengameart.org/content/skeleton-with-rig
Garment, hood, staff, rig and animations: Wildfire Games, 0 A.D., CC-BY-SA-3.0.
https://github.com/0ad/0ad/tree/61a3b9507d974084e6badb88a0826bd89a6d5b8b/binaries/data/mods/public/art
https://creativecommons.org/licenses/by-sa/3.0/
Adaptations by MiYu: skeletal face/hands/feet fitted to the caster skeleton,
removed human neck/hands/shoes, dyed fabric, skull staff cap, staff grip placement,
UV atlas, animation sampling, native PBR materials and unit portrait.
These adaptations are CC-BY-SA-3.0. Sources and hashes: necromancer-sources.json.
Original sources: SourceAssets/anatomical-skeleton and SourceAssets/0ad.
Prepared sources: SourceAssets/necromancer/body.glb and body_base.png.
Runtime derivatives: Assets/Models/RealNecromancer.glb,
Assets/Textures/RealNecromancer_*.png, Assets/Materials/RealNecromancer.mmat,
and the RealNecromancer portrait in Assets/Art/unit-portraits.png.
'''
for folder in ['Licenses','Assets/Licenses']:(SAMPLE/folder/'Anatomical-Necromancer.txt').write_bytes(license_text.encode())
print('Prepared anatomical caster',manifest['preparationStats'])

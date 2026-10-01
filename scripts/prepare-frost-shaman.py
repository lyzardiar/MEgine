"""Author: MiYu. Fit GuieA_7's textured orc face and hands to a 0 A.D. robed caster."""
import bpy, bmesh, hashlib, importlib.util, json
import numpy as np
from pathlib import Path
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';FOLDER=SAMPLE/'SourceAssets/shaman';FOLDER.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('humans',ROOT/'scripts/import-frost-humans.py');humans=importlib.util.module_from_spec(spec);spec.loader.exec_module(humans)
orc_manifest=json.loads((SAMPLE/'orc-sources.json').read_text());caster_manifest=json.loads((SAMPLE/'mage-sources.json').read_text())
paths=['meshes/skeletal/new/m_dress_sleeves.dae','textures/skins/skeletal/pers/robes_healer_01.png','meshes/props/m_staff.dae','textures/skins/structural/celt_struct_1.dds','animation/biped/citizen/idle_relax_h_m.dae','animation/biped/citizen/walk_relax_h_m.dae','animation/biped/citizen/healing_m.dae','animation/biped/infantry/death_a.dae']
sources=orc_manifest['sources']+[e for e in caster_manifest['sources'] if e['file'] in ['SourceAssets/0ad/'+p for p in paths]];assert len(sources)==len(orc_manifest['sources'])+len(paths)
for entry in sources:assert hashlib.sha256((SAMPLE/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
bpy.ops.wm.open_mainfile(filepath=str(SAMPLE/'SourceAssets/orc/Orc/orc.blend'),load_ui=False,use_scripts=False)
orc=bpy.data.objects['orc'];orc_rig=bpy.data.objects['armaorc'];orc_rig.data.pose_position='REST';orc_rig.animation_data_clear();bpy.context.view_layer.update();bpy.context.view_layer.objects.active=orc
for modifier in list(orc.modifiers):
    if modifier.type!='ARMATURE':bpy.ops.object.modifier_apply(modifier=modifier.name)
orc.data.transform(orc.matrix_world)
if orc.matrix_world.determinant()<0:orc.data.flip_normals()
ar={b.name:orc_rig.matrix_world@b.matrix_local for b in orc_rig.data.bones}
objects=humans.import_dae('meshes/skeletal/new/m_dress_sleeves.dae');rig=next(o for o in objects if o.type=='ARMATURE');robe=next(o for o in objects if o.type=='MESH');rig.data.pose_position='REST';rig.animation_data_clear()
matrices=humans.attachment_matrices('meshes/skeletal/new/m_dress_sleeves.dae');robe.data.transform(robe.matrix_world);robe.parent=rig;robe.matrix_parent_inverse=Matrix.Identity(4);robe.matrix_basis=Matrix.Identity(4)
hr={b.name:rig.matrix_world@b.matrix_local for b in rig.data.bones}
skin_groups={'neck','head'}|{n+'_'+s for n in ['hand','finger','fingertip'] for s in ['L','R']}
skin_vertices={v.index for v in robe.data.vertices if robe.vertex_groups[max(v.groups,key=lambda g:g.weight).group].name in skin_groups}
bm=bmesh.new();bm.from_mesh(robe.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index in skin_vertices],context='VERTS');bm.to_mesh(robe.data);bm.free();robe_vertices=len(robe.data.vertices)
transforms={'head':Matrix.Translation(hr['head'].translation+Vector((0,.07,-.08)))@Matrix.Scale(.57,4)@Matrix.Translation(-ar['head'].translation)}
for side in ['L','R']:
    source=ar['wrist.'+side].translation;target=hr['hand_'+side].translation;sd=ar['finger2_a.'+side].translation-source;td=hr['finger_'+side].translation-target
    transforms['hand_'+side]=Matrix.Translation(target)@sd.rotation_difference(td).to_matrix().to_4x4()@Matrix.Scale(td.length/sd.length,4)@Matrix.Translation(-source)
kept={};weights={}
for v in orc.data.vertices:
    original=[(orc.vertex_groups[g.group].name,g.weight) for g in v.groups];dominant=max(original,key=lambda g:g[1])[0]
    region='head' if dominant in ['head','jaw'] else 'hand_'+dominant[-1] if dominant.startswith(('wrist.','finger','thumb.')) else None
    if region is None:continue
    point=v.co.copy()
    if region=='hand_R' and dominant.startswith('finger'):
        first=dominant.replace('_b.','_a.');pivot=ar[first].translation
        if '_b.' in dominant:
            tip=ar[dominant].translation;point=Matrix.Translation(tip)@Matrix.Rotation(-.9,4,'Y')@Matrix.Translation(-tip)@point
        point=Matrix.Translation(pivot)@Matrix.Rotation(-1.2,4,'Y')@Matrix.Translation(-pivot)@point
    kept[v.index]=transforms[region]@point;weights[v.index]={}
    for name,weight in original:
        bone='head' if region=='head' else 'hand_R' if region=='hand_R' else ('fingertip_' if name.startswith('finger') and '_b.' in name else 'finger_' if name.startswith('finger') else 'hand_')+region[-1]
        weights[v.index][bone]=weights[v.index].get(bone,0)+weight
for v in orc.data.vertices:
    if v.index in kept:v.co=kept[v.index]
orc.vertex_groups.clear()
for name in sorted({n for groups in weights.values() for n in groups}):orc.vertex_groups.new(name=name)
for i,groups in weights.items():
    for name,weight in groups.items():orc.vertex_groups[name].add([i],weight,'REPLACE')
bm=bmesh.new();bm.from_mesh(orc.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in kept],context='VERTS');bm.to_mesh(orc.data);bm.free()
orc.parent=rig;orc.matrix_parent_inverse=Matrix.Identity(4);orc.matrix_basis=Matrix.Identity(4);orc.modifiers.clear();orc.modifiers.new('Caster joints','ARMATURE').object=rig
parts=[(robe,'SourceAssets/0ad/textures/skins/skeletal/pers/robes_healer_01.png','robe'),(orc,'SourceAssets/orc/Orc/orc.png','skin')]
for obj in [o for o in humans.import_dae('meshes/props/m_staff.dae') if o.type=='MESH']:
    obj.data.transform(matrices['prop-weapon_R']@obj.matrix_world);obj.parent=rig;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4);obj.vertex_groups.clear();obj.vertex_groups.new(name='prop-weapon_R').add(list(range(len(obj.data.vertices))),1,'REPLACE');obj.modifiers.clear();obj.modifiers.new('Staff socket','ARMATURE').object=rig;parts.append((obj,'SourceAssets/0ad/textures/skins/structural/celt_struct_1.dds','wood'))
staff=parts[-1][0];tip=max((v.co for v in staff.data.vertices),key=lambda v:v.z);base=min((v.co for v in staff.data.vertices),key=lambda v:v.z);staff.data.transform(Matrix.Translation((tip-base).normalized()*.55))
assert len(parts)==3
tiles=[]
for index,(obj,path,style) in enumerate(parts):
    image=bpy.data.images.load(str(SAMPLE/path),check_existing=False);image.alpha_mode='CHANNEL_PACKED';image.scale(1024,1024);pixels=np.empty(1024*1024*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape((1024,1024,4))
    if style=='robe':pixels[:,:,:3]*=pixels[:,:,3:4]*np.array([.70,.57,.39])+(1-pixels[:,:,3:4])*np.array([.28,.35,.29])
    if style=='skin':
        paint=(pixels[:,:,0]>pixels[:,:,1]*1.05)&(pixels[:,:,2]>pixels[:,:,1]*.9)&(pixels[:,:,2]>pixels[:,:,0]*.5);pixels[paint,:3]=pixels[paint,:3].mean(axis=1,keepdims=True)*np.array([.55,.45,.32]);pixels[:,:,:3]*=np.array([.8,.84,.76])
    pixels[:,:,3]=1;tiles.append(pixels);obj.data.uv_layers.active.name='UVMap'
    for uv in obj.data.uv_layers.active.data:uv.uv.x=(min(.9995,max(.0005,uv.uv.x))+index%2)/2;uv.uv.y=(min(.9995,max(.0005,uv.uv.y))+index//2)/2
tiles.append(tiles[-1]);atlas=bpy.data.images.new('Shaman source',width=2048,height=2048,alpha=False);atlas.pixels.foreach_set(np.concatenate([np.concatenate(tiles[:2],axis=1),np.concatenate(tiles[2:],axis=1)],axis=0).ravel());atlas.filepath_raw=str(FOLDER/'body_base.png');atlas.file_format='PNG';atlas.save()
bpy.ops.object.select_all(action='DESELECT')
for obj,_,_ in parts:obj.select_set(True)
bpy.context.view_layer.objects.active=robe;bpy.ops.object.join();robe.name='Orc robed shaman';bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False);robe.data.materials.clear()
rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.export_scene.gltf(filepath=str(FOLDER/'body.glb'),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=False)
derived=[{'file':p.relative_to(SAMPLE).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [FOLDER/'body.glb',FOLDER/'body_base.png']]
manifest={'author':'Guillaume GuieA_7 Englert; Wildfire Games; MiYu assembly','license':'CC-BY-SA-4.0','licenseUrl':'https://creativecommons.org/licenses/by-sa/4.0/','sourceRoot':'SourceAssets','preparation':'scripts/prepare-frost-shaman.py','generator':'scripts/import-frost-humans.py --manifest shaman-sources.json','dependencies':['orc-sources.json','mage-sources.json'],'preparationStats':{'garmentVertices':robe_vertices,'orcVertices':len(kept),'removedHumanSkinVertices':len(skin_vertices)},'models':{'RealShaman':{'parts':[{'mesh':'shaman/body.glb','attachmentSource':'0ad/meshes/skeletal/new/m_dress_sleeves.dae','base':'shaman/body_base.png','bone':None,'tint':None}],'animations':{'Idle':'0ad/animation/biped/citizen/idle_relax_h_m.dae','Walk':'0ad/animation/biped/citizen/walk_relax_h_m.dae','Staff_Attack':'0ad/animation/biped/citizen/healing_m.dae','Death':'0ad/animation/biped/infantry/death_a.dae'},'height':3.3,'attackEvent':.25,'groundClips':['Death']}},'sources':sources+derived}
(SAMPLE/'shaman-sources.json').write_text(json.dumps(manifest,indent=2)+'\n')
license_text='''Orc robed shaman / RealShaman
Orc face, hands and skin: Guillaume "GuieA_7" Englert, CC-BY-SA-4.0.
https://opengameart.org/content/orc-3d
https://creativecommons.org/licenses/by-sa/4.0/
Garment, staff, rig and animations: Wildfire Games, 0 A.D., CC-BY-SA-3.0.
https://github.com/0ad/0ad/tree/61a3b9507d974084e6badb88a0826bd89a6d5b8b/binaries/data/mods/public/art
https://creativecommons.org/licenses/by-sa/3.0/
Adaptations by MiYu: fitted orc face and hands to caster joints, removed human skin,
dyed fabric, UV atlas, native PBR surfaces, animation sampling and unit portrait.
Combined adaptation licensed under CC-BY-SA-4.0; original sources retain their licenses.
Sources, hashes and generation instructions: shaman-sources.json.
Originals: SourceAssets/orc and SourceAssets/0ad. Prepared: SourceAssets/shaman.
Derivatives: Assets/Models/RealShaman.glb, Assets/Textures/RealShaman_*.png,
Assets/Materials/RealShaman.mmat and RealShaman in Assets/Art/unit-portraits.png.
'''
for folder in ['Licenses','Assets/Licenses']:(SAMPLE/folder/'Orc-Shaman.txt').write_bytes(license_text.encode())
print('Prepared orc shaman',manifest['preparationStats'])

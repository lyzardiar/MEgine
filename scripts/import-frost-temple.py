"""Author: MiYu. Adapt the CC0 medieval cathedral exterior into a textured Revenant temple."""
import bpy, bmesh, hashlib, json, math, urllib.request
from pathlib import Path
from mathutils import Matrix, Vector
import numpy as np

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';KEY='RealTemple';manifest_path=SAMPLE/'temple-sources.json';manifest=json.loads(manifest_path.read_text());generated=[]
for entry in manifest['sources']:
    path=SAMPLE/entry['file']
    if not path.exists():
        data=urllib.request.urlopen(entry['url'],timeout=90).read();assert hashlib.sha256(data).hexdigest()==entry['sha256'];path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'],entry['file']
bpy.ops.wm.open_mainfile(filepath=str(SAMPLE/'SourceAssets/medieval-temple/church.blend'))
# The detailed interior, bell mechanism and sun emblem are not part of the temple exterior.
removed=['Innansorra','Bell','ClockHolder','SunSymbol'];kept=[]
for obj in list(bpy.context.scene.objects):
    if obj.type!='MESH' or obj.name in removed:bpy.data.objects.remove(obj,do_unlink=True);continue
    obj.hide_set(False);obj.hide_viewport=False;obj.hide_render=False;obj.data.uv_layers.active.name='SourceUV';kept.append(obj.name)
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=bpy.context.selected_objects[0];bpy.ops.object.join();mesh=bpy.context.object;mesh.name=KEY
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
points=[v.co for v in mesh.data.vertices];low=Vector([min(p[i] for p in points) for i in range(3)]);high=Vector([max(p[i] for p in points) for i in range(3)]);scale=8/max(high.x-low.x,high.y-low.y)
mesh.data.transform(Matrix.Scale(scale,4)@Matrix.Translation(Vector((-(low.x+high.x)/2,-(low.y+high.y)/2,-low.z))))
# A recessed green lantern is visible only through the source tower's window openings.
bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.5,depth=1.25,location=(.089,-1.792,5.23));lantern=bpy.context.object;lantern.name='Soul lantern';lantern.data.uv_layers.active.name='SourceUV';glow=bpy.data.materials.new('SoulGlow');glow.diffuse_color=(.015,.24,.07,1);lantern.data.materials.append(glow)
mesh.select_set(True);bpy.context.view_layer.objects.active=mesh;bpy.ops.object.join();bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
surfaces={}
for mat in mesh.data.materials:
    original=next((n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None) if mat.use_nodes else None;fallback=tuple(mat.diffuse_color)
    mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links;out=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');emit=nodes.new('ShaderNodeEmission');uv=nodes.new('ShaderNodeUVMap');uv.uv_map='SourceUV'
    if original:
        tex=nodes.new('ShaderNodeTexImage');tex.image=original;links.new(uv.outputs['UV'],tex.inputs['Vector']);color=tex.outputs['Color']
    else:
        value=nodes.new('ShaderNodeRGB');value.outputs[0].default_value=fallback;color=value.outputs[0]
    metal=mat.name in ['Metal','WroughtIron','RustedMetal'];roof=mat.name in ['Metal','RoofTilesStone'];wood=mat.name in ['Wood','LogEdgeWeathered','ChurchDoor1','DoorType1_2']
    tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(*((.38,.53,.49) if roof else (.6,.55,.45) if wood else (.62,.68,.65)),1);links.new(color,tint.inputs[1]);color=tint.outputs[0]
    links.new(color,shader.inputs['Base Color']);shader.inputs['Roughness'].default_value=.55 if metal else .88
    if original and not metal:
        bump=nodes.new('ShaderNodeBump');links.new(color,bump.inputs['Height']);bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.012;links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    arm=nodes.new('ShaderNodeRGB');arm.outputs[0].default_value=(1,.55 if metal else .88,.45 if metal else 0,1);emissive=nodes.new('ShaderNodeRGB');emissive.outputs[0].default_value=(.025,.6,.14,1) if mat.name=='SoulGlow' else (0,0,0,1);surfaces[mat.name]=(out,shader,emit,color,arm.outputs[0],emissive.outputs[0])
mesh.data.uv_layers.new(name='Atlas');mesh.data.uv_layers.active_index=len(mesh.data.uv_layers)-1;mesh.data.uv_layers.active.active_render=True
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00001);bpy.ops.mesh.dissolve_limited(angle_limit=.001);bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.006);bpy.ops.object.mode_set(mode='OBJECT')
triangulate=mesh.modifiers.new('Stable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=triangulate.name)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1;scene.cycles.seed=0;scene.render.threads_mode='FIXED';scene.render.threads=1;scene.render.bake.margin=10
textures={};base=None
for channel in ['base','normal','arm','emissive','ao']:
    atlas=bpy.data.images.new(KEY+' '+channel,width=2048,height=2048,alpha=False);atlas.colorspace_settings.name='sRGB' if channel in ['base','emissive'] else 'Non-Color'
    for mat in mesh.data.materials:
        out,shader,emit,color,arm,emissive=surfaces[mat.name];links=mat.node_tree.links
        if channel in ['normal','ao']:links.new(shader.outputs['BSDF'],out.inputs['Surface'])
        else:links.new(color if channel=='base' else emissive if channel=='emissive' else arm,emit.inputs['Color']);links.new(emit.outputs[0],out.inputs['Surface'])
        target=mat.node_tree.nodes.new('ShaderNodeTexImage');target.image=atlas;mat.node_tree.nodes.active=target
    bpy.ops.object.bake(type='NORMAL' if channel=='normal' else 'AO' if channel=='ao' else 'EMIT')
    if channel=='base':base=atlas
    if channel=='ao':
        pixels=np.array(base.pixels[:],dtype=np.float32).reshape(-1,4);ao=np.array(atlas.pixels[:],dtype=np.float32).reshape(-1,4);pixels[:,:3]*=.65+.35*ao[:,:3];base.pixels.foreach_set(pixels.ravel());base.save();continue
    path='Assets/Textures/'+KEY+'_'+channel+'.png';atlas.filepath_raw=str(SAMPLE/path);atlas.file_format='PNG';atlas.save();textures[channel]=path;generated.append(path)
while len(mesh.data.uv_layers)>1:mesh.data.uv_layers.remove(mesh.data.uv_layers[0])
mesh.data.uv_layers.active.name='UVMap'
for face in mesh.data.polygons:face.material_index=0
mesh.data.materials.clear();mesh.data.materials.append(bpy.data.materials.new(KEY+' atlas'))
# Discard source vertices that are not referenced by any exported face before final fitting.
bm=bmesh.new();bm.from_mesh(mesh.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(mesh.data);bm.free()
points=[v.co for v in mesh.data.vertices];low=Vector([min(p[i] for p in points) for i in range(3)]);high=Vector([max(p[i] for p in points) for i in range(3)]);fit=8/max(high.x-low.x,high.y-low.y);mesh.data.transform(Matrix.Scale(fit,4)@Matrix.Translation(Vector((-(low.x+high.x)/2,-(low.y+high.y)/2,-low.z))))
model='Assets/Models/'+KEY+'.glb';bpy.ops.export_scene.gltf(filepath=str(SAMPLE/model),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=False,export_extras=False);generated.append(model)
points=[v.co for v in mesh.data.vertices];size=[max(p[i] for p in points)-min(p[i] for p in points) for i in [0,2,1]]
material='Assets/Materials/'+KEY+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':KEY,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':textures['base'],'normal_texture':textures['normal'],'normal_scale':1,'emissive':[1,1,1],'emissive_strength':1.2,'emissive_texture':textures['emissive'],'metallic_roughness_texture':textures['arm'],'metallic':1,'roughness':1,'double_sided':True}));generated.append(material)
catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());catalog[KEY]={'material':material,'parts':[{'name':KEY,'mesh':model,'pivot':[0,0,0]}],'size':size,'factionBuilding':True,'realistic':True};catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')
license_text='''Medieval Revenant Temple / RealTemple
Original Medieval Church: Daniel Andersson, CC0-1.0.
https://opengameart.org/content/medieval-church
Cathedral interior adaptation: AnyRPG, CC0-1.0.
https://opengameart.org/content/medieval-church-interior
https://creativecommons.org/publicdomain/zero/1.0/
MEngine adaptations by MiYu, CC0-1.0: exterior selection, stone/roof tint,
UV atlas, baked occlusion, texture-derived relief normals, material channels and recessed soul lantern.
Derived files: Assets/Models/RealTemple.glb, Assets/Textures/RealTemple_*.png,
Assets/Materials/RealTemple.mmat and RealTemple building portrait.
Source model contains its original packed textures. Source URLs and hashes:
temple-sources.json. Rebuild with scripts/import-frost-temple.py in Blender 4.5.9.
'''
for folder in ['Licenses','Assets/Licenses']:
    path=folder+'/Medieval-Temple.txt';(SAMPLE/path).write_bytes(license_text.encode());generated.append(path)
manifest['model']={'key':KEY,'triangles':len(mesh.data.polygons),'size':size,'keptObjects':kept,'removedObjects':removed};manifest['generated']=[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in generated];manifest_path.write_text(json.dumps(manifest,indent=2)+'\n');print('Imported',manifest['model'])

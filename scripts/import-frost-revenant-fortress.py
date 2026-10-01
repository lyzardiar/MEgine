"""Author: MiYu. Build three textured Revenant strongholds from rubberduck's CC0 castle modules."""
import bpy, bmesh, hashlib, json, math, urllib.request, zipfile
from pathlib import Path
from mathutils import Vector, Matrix
import numpy as np

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';MANIFEST=SAMPLE/'revenant-fortress-sources.json';manifest=json.loads(MANIFEST.read_text());folder=ROOT/'tmp/revenant-fortress';folder.mkdir(parents=True,exist_ok=True)
for entry in manifest['sources']:
    target=SAMPLE/entry['file']
    if not target.exists():target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(urllib.request.urlopen(entry['url'],timeout=90).read())
    assert hashlib.sha256(target.read_bytes()).hexdigest()==entry['sha256'],entry['file']
with zipfile.ZipFile(SAMPLE/manifest['sources'][0]['file']) as archive:
    for entry in archive.infolist():assert (folder/entry.filename).resolve().is_relative_to(folder.resolve())
    archive.extractall(folder)
bpy.ops.wm.open_mainfile(filepath=str(folder/'3d-tileset-1-1.blend'))
names=['castle-wall-gate-new','castle-wall-w-deco-1','castle-wall-w-window','edge-column-1','castle-column','gate-big-2']
originals={name:bpy.data.objects[name] for name in names}
for obj in list(bpy.data.objects):
    if obj.name not in names:bpy.data.objects.remove(obj,do_unlink=True)
for obj in originals.values():
    obj.hide_set(True);obj.hide_render=True;obj.data.uv_layers.active.name='SourceUV'
textures={'wall-1':('wall-tex-1.jpg','wall-tex-1_norm.jpg'),'tiles-non-ground':('tile_tantiles.jpg','tile_tantiles_norm.jpg'),'concrete':('concrete01_diff.jpg','concrete01_norm.jpg'),'dark_wall':('wall-window.jpg','wall-window_norm.jpg'),'wooden-gate':('gate.JPG','gate_norm.JPG'),'Roof':('wall-tex-3.jpg','wall-tex-3_norm.jpg')}
surfaces={}
used={m for obj in originals.values() for m in obj.data.materials};roof=bpy.data.materials.new('Roof');glow=bpy.data.materials.new('Soul');used.update([roof,glow])
for mat in used:
    mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links;out=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');emit=nodes.new('ShaderNodeEmission');uv=nodes.new('ShaderNodeUVMap');uv.uv_map='SourceUV'
    base=nodes.new('ShaderNodeRGB');base.outputs[0].default_value=(.015,.045,.035,1);color=base.outputs[0]
    if mat.name!='Soul':
        diffuse,normal=textures[mat.name];tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(folder/diffuse),check_existing=True);links.new(uv.outputs[0],tex.inputs['Vector']);tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(*((.27,.36,.37) if mat.name=='Roof' else (.65,.72,.71)),1);links.new(tex.outputs['Color'],tint.inputs[1]);color=tint.outputs[0];saturation=nodes.new('ShaderNodeHueSaturation');saturation.inputs['Saturation'].default_value=.3;links.new(color,saturation.inputs['Color']);color=saturation.outputs[0]
        tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(folder/normal),check_existing=True);tex.image.colorspace_settings.name='Non-Color';links.new(uv.outputs[0],tex.inputs['Vector']);mapping=nodes.new('ShaderNodeNormalMap');mapping.uv_map='SourceUV';links.new(tex.outputs['Color'],mapping.inputs['Color']);links.new(mapping.outputs[0],shader.inputs['Normal'])
    links.new(color,shader.inputs['Base Color']);arm=nodes.new('ShaderNodeRGB');arm.outputs[0].default_value=(1,.85,0,1);emission=nodes.new('ShaderNodeRGB');emission.outputs[0].default_value=(.012,.18,.06,1) if mat.name=='Soul' else (0,0,0,1);surfaces[mat.name]=(out,shader,emit,color,arm.outputs[0],emission.outputs[0])
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.seed=0;scene.cycles.device='CPU';scene.render.threads_mode='FIXED';scene.render.threads=1;scene.render.bake.margin=10
catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());generated=[];stats={}

def module(name,size,at,yaw=0):
    source=originals[name];obj=source.copy();obj.data=source.data.copy();scene.collection.objects.link(obj);obj.hide_set(False);obj.hide_render=False
    points=[source.matrix_world@v.co for v in source.data.vertices];lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)]);center=Vector(((hi.x+lo.x)/2,(hi.y+lo.y)/2,lo.z));rotation=Matrix.Rotation(yaw,4,'Z')
    for v,p in zip(obj.data.vertices,points):v.co=rotation@Vector([(p[i]-center[i])*size[i]/max(hi[i]-lo[i],.0001) for i in range(3)])+Vector(at)
    obj.matrix_world=Matrix.Identity(4);return obj

def block(size,at,mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=at);obj=bpy.context.object;obj.scale=size;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);obj.data.materials.append(mat);obj.data.uv_layers.active.name='SourceUV'
    # World-sized face UVs retain stone scale on authored foundations and frames.
    for face in obj.data.polygons:
        axes=sorted(range(3),key=lambda i:abs(face.normal[i]))[:2]
        for loop in face.loop_indices:obj.data.uv_layers.active.data[loop].uv=[obj.data.vertices[obj.data.loops[loop].vertex_index].co[i]/2 for i in axes]
    return obj

def spire(width,height,at):
    bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=width/math.sqrt(2),radius2=0,depth=height,location=(at[0],at[1],at[2]+height/2),rotation=(0,0,math.pi/4));obj=bpy.context.object;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);obj.data.materials.append(roof);obj.data.uv_layers.active.name='SourceUV';return obj

for tier in [1,2,3]:
    key='RevenantHall'+(str(tier) if tier>1 else '');parts=[];stone=bpy.data.materials['concrete'];height=3.7+(tier-1)*.55
    for level,width in enumerate([7.4,7,6.6]):parts.append(block((width,width,.22),(0,0,.11+level*.22),stone))
    parts.append(block((4.8,4.8,height-.5),(0,0,.65+(height-.5)/2),bpy.data.materials['wall-1']))
    parts.append(module('castle-wall-gate-new',(4.4,.75,height),(0,-2.2,.65)))
    parts.append(module('gate-big-2',(2,.08,2.75),(0,-2.58,.65)))
    for x in [-1.15,1.15]:parts.append(module('castle-wall-w-deco-1',(2.3,.65,height),(x,2.2,.65),math.pi))
    for side in [-1,1]:
        for y in [-1.15,1.15]:parts.append(module('castle-wall-w-window',(2.3,.65,height),(side*2.2,y,.65),side*math.pi/2))
    for x in [-2.25,2.25]:
        for y in [-2.25,2.25]:parts.append(module('edge-column-1',(.7,.7,height+.45),(x,y,.65)))
    parts.append(spire(5.15,2.1+(tier-1)*.65,(0,0,height+.5)))
    # Four slim framed soul windows sit on each facade; the door remains unobstructed.
    for side in [-1,1]:
        for y in [-.85,.85]:
            parts.append(block((.06,.32,1.25),(side*2.57,y,2.3),glow))
            for offset in [-.22,.22]:parts.append(block((.16,.1,1.5),(side*2.61,y+offset,2.3),stone))
            for z in [1.57,3.03]:parts.append(block((.16,.54,.1),(side*2.61,y,z),stone))
    corners=[(-2.9,2.9),(2.9,2.9)]+([(-2.9,-2.9),(2.9,-2.9)] if tier>1 else [])
    for x,y in corners:
        tower_height=3.2+tier*.6;parts.append(module('castle-column',(1.1,1.1,tower_height),(x,y,.55)));parts.append(block((.86,.86,.3),(x,y,tower_height+.7),stone));parts.append(spire(1.5,1.1+tier*.35,(x,y,tower_height+.85)))
        for offset in [-1,1]:
            parts.append(block((.06,.23,.85),(x+offset*.57,y,tower_height-.05),glow))
            for shift in [-.17,.17]:parts.append(block((.14,.1,1.05),(x+offset*.61,y+shift,tower_height-.05),stone))
            for z in [tower_height-.53,tower_height+.43]:parts.append(block((.14,.44,.1),(x+offset*.61,y,z),stone))
    if tier==3:
        parts.append(module('castle-column',(1,1,1.6),(0,0,height+1.6)));parts.append(spire(1.35,1.8,(0,0,height+3.1)))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:obj.select_set(True)
    obj=parts[0];bpy.context.view_layer.objects.active=obj;bpy.ops.object.join();obj.name='Real'+key
    modifier=obj.modifiers.new('Stable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(obj.data);bm.free()
    obj.data.uv_layers.new(name='Atlas');obj.data.uv_layers.active_index=len(obj.data.uv_layers)-1;obj.data.uv_layers.active.active_render=True;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.006);bpy.ops.object.mode_set(mode='OBJECT');maps={};base=None
    for channel in ['base','normal','arm','emissive','ao']:
        atlas=bpy.data.images.new(key+' '+channel,width=2048,height=2048,alpha=False);atlas.colorspace_settings.name='sRGB' if channel in ['base','emissive'] else 'Non-Color'
        for mat in obj.data.materials:
            out,shader,emit,color,arm,emission=surfaces[mat.name];links=mat.node_tree.links
            if channel in ['normal','ao']:links.new(shader.outputs[0],out.inputs['Surface'])
            else:links.new(color if channel=='base' else arm if channel=='arm' else emission,emit.inputs['Color']);links.new(emit.outputs[0],out.inputs['Surface'])
            target=mat.node_tree.nodes.new('ShaderNodeTexImage');target.image=atlas;mat.node_tree.nodes.active=target
        bpy.ops.object.bake(type='NORMAL' if channel=='normal' else 'AO' if channel=='ao' else 'EMIT')
        if channel=='base':base=atlas
        if channel=='ao':
            pixels=np.array(base.pixels[:],dtype=np.float32).reshape(-1,4);ao=np.array(atlas.pixels[:],dtype=np.float32).reshape(-1,4);pixels[:,:3]*=.6+.4*ao[:,:3];base.pixels.foreach_set(pixels.ravel());base.save();continue
        relative='Assets/Textures/Real'+key+'_'+channel+'.png';atlas.filepath_raw=str(SAMPLE/relative);atlas.file_format='PNG';atlas.save();maps[channel]=relative;generated.append(relative)
    while len(obj.data.uv_layers)>1:obj.data.uv_layers.remove(obj.data.uv_layers[0])
    obj.data.uv_layers.active.name='UVMap'
    for face in obj.data.polygons:face.material_index=0
    obj.data.materials.clear();obj.data.materials.append(bpy.data.materials.new('Real'+key+' atlas'))
    mesh='Assets/Models/Real'+key+'.glb';bpy.ops.export_scene.gltf(filepath=str(SAMPLE/mesh),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=False,export_extras=False);generated.append(mesh)
    material='Assets/Materials/Real'+key+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':'Stone '+key,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':maps['base'],'normal_texture':maps['normal'],'normal_scale':.7,'metallic_roughness_texture':maps['arm'],'roughness':1,'metallic':1,'emissive_texture':maps['emissive'],'emissive':[1,1,1],'emissive_strength':1,'double_sided':True}));generated.append(material)
    points=[v.co for v in obj.data.vertices];size=[max(p[i] for p in points)-min(p[i] for p in points) for i in [0,2,1]];catalog[key]={'material':material,'parts':[{'name':key,'mesh':mesh,'pivot':[0,0,0]}],'size':size,'factionBuilding':True,'realistic':True};stats[key]={'triangles':len(obj.data.polygons),'size':size,'modules':len(parts)};bpy.data.objects.remove(obj,do_unlink=True);print('Imported',key,stats[key],flush=True)
license_text='''Revenant stone strongholds / RealRevenantHall, RealRevenantHall2, RealRevenantHall3
Castle / Dungeon Tileset Extended by rubberduck, CC0-1.0.
https://opengameart.org/content/3d-castle-dungeon-tileset-extended
https://creativecommons.org/publicdomain/zero/1.0/
Source textures include CC0 works by scouser and BMacZero, and concrete01
from Pietextureset. The complete source readme is inside the pinned archive.
MEngine layout, stepped foundations, roofs, soul windows and atlas adaptations
by MiYu, CC0-1.0. Derived files: RealRevenantHall*.glb, RealRevenantHall*.png,
RealRevenantHall*.mmat, and RevenantHall portraits in faction-buildings.png.
Sources and SHA-256: revenant-fortress-sources.json.
Rebuild: Blender 4.5.9 with scripts/import-frost-revenant-fortress.py.
'''
for location in ['Licenses/Revenant-Fortress.txt','Assets/Licenses/Revenant-Fortress.txt']:(SAMPLE/location).write_bytes(license_text.encode());generated.append(location)
manifest['modules']=names;manifest['models']=stats;manifest['generated']=[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in generated];MANIFEST.write_text(json.dumps(manifest,indent=2)+'\n');catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')

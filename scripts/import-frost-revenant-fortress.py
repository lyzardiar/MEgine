"""Author: MiYu. Build textured Revenant masonry from rubberduck's CC0 castle modules."""
import bpy, bmesh, hashlib, json, math, sys, urllib.request, zipfile
from pathlib import Path
from mathutils import Vector, Matrix
import numpy as np

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';MINE='--mine-only' in sys.argv;CRYPT='--crypt-only' in sys.argv;ZIGGURAT='--ziggurat-only' in sys.argv;MANIFEST=SAMPLE/('ziggurat-sources.json' if ZIGGURAT else 'crypt-sources.json' if CRYPT else 'haunted-mine-sources.json' if MINE else 'revenant-fortress-sources.json');manifest=json.loads(MANIFEST.read_text());folder=ROOT/'tmp/revenant-fortress';folder.mkdir(parents=True,exist_ok=True)
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

def vault(radius,thickness,length,at,mat):
    vertices=[];faces=[];segments=20
    for i in range(segments+1):
        angle=i*math.pi/segments
        for r,y in [(radius,-length/2),(radius,length/2),(radius-thickness,-length/2),(radius-thickness,length/2)]:vertices.append((at[0]+r*math.cos(angle),at[1]+y,at[2]+r*math.sin(angle)))
        if i:
            a=(i-1)*4;b=i*4;faces.extend([(a,a+1,b+1,b),(a+2,b+2,b+3,a+3),(a,b,b+2,a+2),(a+1,a+3,b+3,b+1)])
    faces.extend([(0,2,3,1),(segments*4,segments*4+1,segments*4+3,segments*4+2)])
    mesh=bpy.data.meshes.new('Crypt vault');mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new('Crypt vault',mesh);scene.collection.objects.link(obj);mesh.materials.append(mat);uv=mesh.uv_layers.new(name='SourceUV')
    for face in mesh.polygons:
        axes=sorted(range(3),key=lambda i:abs(face.normal[i]))[:2]
        for loop in face.loop_indices:uv.data[loop].uv=[mesh.vertices[mesh.loops[loop].vertex_index].co[i]/2 for i in axes]
    return obj

def vault_end(radius,depth,at,mat):
    profile=[(0,0)]+[(radius*math.cos(i*math.pi/20),radius*math.sin(i*math.pi/20)) for i in range(21)];n=len(profile);vertices=[(at[0]+x,at[1]+y,at[2]+z) for y in [-depth/2,depth/2] for x,z in profile];faces=[]
    for i in range(1,n-1):faces.extend([(0,i,i+1),(n,n+i+1,n+i)])
    for i in range(n):j=(i+1)%n;faces.append((i,i+n,j+n,j))
    mesh=bpy.data.meshes.new('Crypt gable');mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new('Crypt gable',mesh);scene.collection.objects.link(obj);mesh.materials.append(mat);uv=mesh.uv_layers.new(name='SourceUV')
    for face in mesh.polygons:
        axes=sorted(range(3),key=lambda i:abs(face.normal[i]))[:2]
        for loop in face.loop_indices:uv.data[loop].uv=[mesh.vertices[mesh.loops[loop].vertex_index].co[i]/2 for i in axes]
    return obj

for tier in ([0,1] if ZIGGURAT else [0] if MINE or CRYPT else [1,2,3]):
    key=('RevenantTower' if tier else 'RevenantLodge') if ZIGGURAT else 'RevenantBarracks' if CRYPT else 'HauntedMine' if MINE else 'RevenantHall'+(str(tier) if tier>1 else '');parts=[];stone=bpy.data.materials['concrete'];height=3.7+(tier-1)*.55
    if ZIGGURAT:
        # Broad masonry terraces and four arched facades form the shared ritual base.
        for level,width in enumerate([5.0,4.6,4.2]):parts.append(block((width,width,.2),(0,0,.1+level*.2),stone))
        for i in range(4):
            angle=i*math.pi/2;parts.append(module('castle-wall-gate-new',(3.5,.4,1.7),(math.sin(angle)*1.7,-math.cos(angle)*1.7,.6),angle))
        parts.append(block((2.8,2.8,.18),(0,0,2.22),stone))
        parts.append(block((2.3,2.3,.08),(0,0,.65),bpy.data.materials['dark_wall']))
        for x in [-1.6,1.6]:
            for y in [-1.6,1.6]:
                parts.append(module('edge-column-1',(.6,.6,2.5),(x,y,.5)));parts.append(spire(.8,.65,(x,y,3.0)))
                parts.append(block((.14,.14,.35),(x,y,2.85),glow))
        for step,width in enumerate([2.9,2.5,2.1]):parts.append(block((width,width,.18),(0,0,2.39+step*.18),roof))
        if tier:
            # A caged soul core rises above the same base, supported by carved columns.
            for x in [-.72,.72]:
                for y in [-.72,.72]:
                    parts.append(module('castle-column',(.42,.42,3.5),(x,y,2.8)));parts.append(spire(.65,1.2,(x,y,6.3)))
            for z in [3.05,4.2,6.25]:
                for side in [-1,1]:
                    parts.append(block((1.95,.16,.18),(0,side*.8,z),stone));parts.append(block((.16,1.6,.18),(side*.8,0,z),stone))
            parts.append(module('castle-column',(.72,.72,.9),(0,0,2.85)))
            parts.append(block((.95,.95,.16),(0,0,4.15),stone))
            bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=8,major_radius=.61,minor_radius=.07,location=(0,0,4.85));ring=bpy.context.object;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);ring.data.materials.append(stone);ring.data.uv_layers.active.name='SourceUV';parts.append(ring)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=.42,location=(0,0,4.9));core=bpy.context.object;core.scale=(1,1,1.4);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);core.data.materials.append(glow);core.data.uv_layers.new(name='SourceUV');parts.append(core)
            for face in core.data.polygons:face.use_smooth=True
        else:
            for x in [-.65,.65]:
                for y in [-.65,.65]:parts.append(module('castle-column',(.25,.25,.75),(x,y,2.85)))
            parts.append(block((1.5,1.5,.16),(0,0,3.62),stone));parts.append(spire(1.75,.85,(0,0,3.7)))
            parts.append(block((.36,.36,.48),(0,0,3.15),glow))
            for x in [-.22,.22]:
                for y in [-.22,.22]:parts.append(block((.09,.09,.6),(x,y,3.15),roof))
            for z in [2.83,3.47]:parts.append(block((.6,.6,.1),(0,0,z),stone))
    elif CRYPT:
        # A recessed mausoleum entrance, ribbed barrel vault and six buttressed pinnacles.
        for level,width in enumerate([6.4,6.0,5.6]):parts.append(block((width,width,.22),(0,0,.11+level*.22),stone))
        for side in [-1,1]:parts.append(block((.4,4.6,2.05),(side*1.9,.15,1.685),bpy.data.materials['wall-1']))
        parts.append(module('castle-wall-gate-new',(3.8,.55,2.3),(0,-2.05,.66)))
        parts.append(module('castle-wall-w-deco-1',(3.8,.45,2.1),(0,2.25,.66),math.pi))
        parts.append(block((3.2,3.7,.08),(0,.2,.69),bpy.data.materials['dark_wall']))
        parts.append(block((2.9,.1,1.85),(0,1.65,1.625),bpy.data.materials['dark_wall']))
        parts.append(vault(2.12,.24,4.8,(0,.1,2.55),roof))
        for y in [-2.15,2.35]:parts.append(vault_end(1.95,.16,(0,y,2.55),bpy.data.materials['wall-1']))
        for y in [-2.3,-.75,.85,2.5]:parts.append(vault(2.25,.19,.18,(0,y,2.55),stone))
        for side in [-1,1]:
            for y in [-2.1,.2,2.3]:
                x=side*2.38;parts.append(module('edge-column-1',(.65,.75,2.9),(x,y,.66)));parts.append(spire(.9,1.1,(x,y,3.56)))
                parts.append(block((.25,.12,.45),(x,y-.4,3.05),glow))
                for z in [2.8,3.3]:parts.append(block((.4,.18,.08),(x,y-.43,z),stone))
                for dx in [-.18,.18]:parts.append(block((.07,.18,.58),(x+dx,y-.43,3.05),stone))
            for y in [-.75,.85]:
                parts.append(block((.08,.36,.9),(side*2.13,y,1.65),glow))
                for shift in [-.24,.24]:parts.append(block((.18,.1,1.12),(side*2.17,y+shift,1.65),stone))
                parts.append(block((.16,.045,1.0),(side*2.2,y,1.65),stone))
                parts.append(block((.16,.45,.045),(side*2.2,y,1.65),stone))
                for z in [1.1,2.2]:parts.append(block((.18,.58,.1),(side*2.17,y,z),stone))
        for x in [-.7,.7]:
            parts.append(module('castle-column',(.28,.28,1.1),(x,-1.1,.7)))
            parts.append(block((.24,.24,.18),(x,-1.1,1.83),glow))
    elif MINE:
        # Pentagonal masonry supports surround a recessed soul-lit excavation.
        parts.append(block((2.5,2.5,.12),(0,0,.06),bpy.data.materials['dark_wall']))
        parts.append(block((1.5,1.5,.025),(0,0,.13),glow))
        for i in range(5):
            angle=i*math.tau/5;x,y=math.cos(angle)*1.65,math.sin(angle)*1.65
            parts.append(module('castle-column',(.5,.5,2.2),(x,y,0)))
            parts.append(spire(.65,.55,(x,y,2.2)))
            parts.append(block((.2,.2,.16),(x,y,2.13),glow))
            midpoint=angle+math.pi/5
            parts.append(module('castle-wall-w-deco-1',(1.65,.3,.65),(math.cos(midpoint)*1.35,math.sin(midpoint)*1.35,0),midpoint+math.pi/2))
    else:
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
    material='Assets/Materials/Real'+key+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':'Stone '+key,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':maps['base'],'normal_texture':maps['normal'],'normal_scale':.7,'metallic_roughness_texture':maps['arm'],'roughness':1,'metallic':1,'emissive_texture':maps['emissive'],'emissive':[1,1,1],'emissive_strength':.45 if ZIGGURAT else .65 if CRYPT else 1,'double_sided':True}));generated.append(material)
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
if MINE:license_text=license_text.replace('Revenant stone strongholds / RealRevenantHall, RealRevenantHall2, RealRevenantHall3','Haunted Gold Mine / RealHauntedMine').replace('RealRevenantHall*','RealHauntedMine*').replace('RevenantHall portraits','HauntedMine portrait').replace('revenant-fortress-sources.json','haunted-mine-sources.json').replace('scripts/import-frost-revenant-fortress.py.','scripts/import-frost-revenant-fortress.py --mine-only.')
if CRYPT:license_text=license_text.replace('Revenant stone strongholds / RealRevenantHall, RealRevenantHall2, RealRevenantHall3','Revenant Crypt / RealRevenantBarracks').replace('RealRevenantHall*','RealRevenantBarracks*').replace('RevenantHall portraits','RevenantBarracks portrait').replace('revenant-fortress-sources.json','crypt-sources.json').replace('scripts/import-frost-revenant-fortress.py.','scripts/import-frost-revenant-fortress.py --crypt-only.').replace('stepped foundations, roofs, soul windows','stepped foundations, ribbed vaults, soul windows')
if ZIGGURAT:license_text=license_text.replace('Revenant stone strongholds / RealRevenantHall, RealRevenantHall2, RealRevenantHall3','Revenant Ziggurat and Soul Tower / RealRevenantLodge, RealRevenantTower').replace('RealRevenantHall*','RealRevenantLodge* and RealRevenantTower*').replace('RevenantHall portraits','RevenantLodge and RevenantTower portraits').replace('revenant-fortress-sources.json','ziggurat-sources.json').replace('scripts/import-frost-revenant-fortress.py.','scripts/import-frost-revenant-fortress.py --ziggurat-only.')
if ZIGGURAT:license_text=license_text.replace('Derived files: RealRevenantLodge* and RealRevenantTower*.glb, RealRevenantLodge* and RealRevenantTower*.png,\nRealRevenantLodge* and RealRevenantTower*.mmat,','Derived files: RealRevenantLodge and RealRevenantTower models, textures and materials,')
for location in (['Licenses/Revenant-Ziggurat.txt','Assets/Licenses/Revenant-Ziggurat.txt'] if ZIGGURAT else ['Licenses/Revenant-Crypt.txt','Assets/Licenses/Revenant-Crypt.txt'] if CRYPT else ['Licenses/Haunted-Mine.txt','Assets/Licenses/Haunted-Mine.txt'] if MINE else ['Licenses/Revenant-Fortress.txt','Assets/Licenses/Revenant-Fortress.txt']):(SAMPLE/location).write_bytes(license_text.encode());generated.append(location)
manifest['modules']=names;manifest['models']=stats;manifest['generated']=[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in generated];MANIFEST.write_text(json.dumps(manifest,indent=2)+'\n');catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')

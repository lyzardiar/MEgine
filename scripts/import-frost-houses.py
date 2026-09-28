"""Author: MiYu. Run with Blender 4.5: --background --factory-startup --python this_file.
Convert Daniel74 CC0 timber houses, bake their original repeating textures and export native game buildings.
"""
import bpy
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';MANIFEST=SAMPLE/'house-sources.json'
manifest=json.loads(MANIFEST.read_text());source=manifest['sources'][0];archive=SAMPLE/source['file']
if not archive.exists():archive.write_bytes(urllib.request.urlopen(source['url'],timeout=90).read())
assert hashlib.sha256(archive.read_bytes()).hexdigest()==source['sha256'],'Source archive changed'
folder=ROOT/'tmp/frost-houses';folder.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as z:
    for entry in z.infolist():assert (folder/entry.filename).resolve().is_relative_to(folder.resolve())
    z.extractall(folder)
blend=next(folder.rglob('*.blend'));bpy.ops.wm.open_mainfile(filepath=str(blend))
originals=[o for o in bpy.data.objects if o.type=='MESH'];depsgraph=bpy.context.evaluated_depsgraph_get();generated=[];catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text())
for mat in bpy.data.materials:
    mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(blend.parent/(mat.name+'.jpg')),check_existing=True);uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';mat.node_tree.links.new(uv.outputs['UV'],tex.inputs['Vector']);mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color']);mat.node_tree.links.new(shader.outputs['BSDF'],out.inputs['Surface'])
layouts={
    'KingdomHall':[(4,1,(0,0,0))],
    'KingdomHall2':[(4,1,(0,0,0)),(1,.65,(-6,0,0))],
    'KingdomHall3':[(4,1,(0,0,0)),(1,.65,(-6,0,0)),(1,.65,(6,0,0))],
    'KingdomLodge':[(1,1,(0,0,0))],
    'KingdomBarracks':[(3,1,(0,0,0)),(1,.65,(6,0,0))],
    'KingdomWorkshop':[(5,1,(0,0,0))],
    'KingdomAltar':[(6,1,(0,0,0))],
    'KingdomTower':[(2,1,(0,0,0))],
}
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.render.bake.margin=8;scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
scene.world.color=(1,1,1)
glass=bpy.data.materials.new('Window glass');glass.use_nodes=True;glass.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.022,.038,.042,1)
def panel(copies,center,size,material):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center);obj=bpy.context.object;obj.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(material);copies.append(obj)
for key,layout in layouts.items():
    copies=[]
    for number,scale,position in layout:
        group=[o for o in originals if o.name.startswith('House'+str(number)+'_')];points=[o.matrix_world@Vector(c) for o in group for c in o.bound_box];lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)]);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
        for original in group:
            obj=original.copy();obj.hide_render=False;obj.data=bpy.data.meshes.new_from_object(original.evaluated_get(depsgraph),preserve_all_data_layers=True,depsgraph=depsgraph);obj.modifiers.clear();scene.collection.objects.link(obj)
            for vertex in obj.data.vertices:vertex.co=(original.matrix_world@vertex.co-center)*scale+Vector(position)
            obj.matrix_world.identity();copies.append(obj)
        wall=next(o for o in group if o.name.endswith('_Level1'));front=min((wall.matrix_world@Vector(c)).y for c in wall.bound_box);y=(front-center.y)*scale+position[1]-.06
        for x in [-2.2,0,2.2]:
            for z in [3.5,5.7] if hi.z-lo.z>9 else [3.5]:
                at=Vector((x*scale+position[0],y,z*scale+position[2]));panel(copies,at,(.95*scale,.1,1.25*scale),bpy.data.materials['Wood']);panel(copies,at+Vector((0,-.06,0)),(.67*scale,.03,.94*scale),glass)
        panel(copies,(position[0],y,position[2]+1.03*scale),(1.3*scale,.16,2.06*scale),bpy.data.materials['Wood'])
    bpy.ops.object.select_all(action='DESELECT')
    for o in copies:o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();obj=copies[0];obj.name='Real'+key
    # The tower keeps the source floors but uses a narrower footprint.
    if key=='KingdomTower':
        for vertex in obj.data.vertices:vertex.co.x*=.55;vertex.co.y*=.55
    points=[v.co for v in obj.data.vertices];center=Vector([(min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)]);center.z=min(p.z for p in points)
    for vertex in obj.data.vertices:vertex.co-=center
    for o in originals:o.hide_render=True
    obj.data.uv_layers.new(name='BakeUV');obj.data.uv_layers.active_index=len(obj.data.uv_layers)-1
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
    atlas=bpy.data.images.new('Atlas '+key,width=1024,height=1024,alpha=False)
    for mat in obj.data.materials:
        node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=atlas;mat.node_tree.nodes.active=node
    bpy.ops.object.bake(type='DIFFUSE',pass_filter={'COLOR'})
    texture='Assets/Textures/Real'+key+'.png';atlas.filepath_raw=str(SAMPLE/texture);atlas.file_format='PNG';atlas.save();generated.append(texture)
    while len(obj.data.uv_layers)>1:obj.data.uv_layers.remove(obj.data.uv_layers[0])
    for poly in obj.data.polygons:poly.material_index=0
    obj.data.materials.clear();mat=bpy.data.materials.new('Baked '+key);obj.data.materials.append(mat)
    mesh='Assets/Models/Real'+key+'.glb';bpy.ops.export_scene.gltf(filepath=str(SAMPLE/mesh),export_format='GLB',use_selection=True,export_materials='NONE',export_yup=True,export_animations=False,export_extras=False);generated.append(mesh)
    material='Assets/Materials/Real'+key+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':'Timber '+key,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':texture,'roughness':.88,'metallic':0,'double_sided':True}));generated.append(material)
    points=[v.co for v in obj.data.vertices];size=[max(p[i] for p in points)-min(p[i] for p in points) for i in (0,2,1)]
    catalog[key]={'material':material,'parts':[{'name':key,'mesh':mesh,'pivot':[0,0,0]}],'size':size,'factionBuilding':True,'realistic':True}
    bpy.data.objects.remove(obj,do_unlink=True);print('Imported '+key,flush=True)
manifest['layouts']=layouts;manifest['generated']=[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in generated];MANIFEST.write_text(json.dumps(manifest,indent=2)+'\n');catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')

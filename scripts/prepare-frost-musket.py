"""Author: MiYu. Bake DREAM_SEARCH_REPEAT's CC0 musket shaders for the native PBR importer."""
import bpy
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];FOLDER=ROOT/'samples/frostbound-realms/SourceAssets/musket';SOURCE=FOLDER/'mosquete.blend'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='6d198b63da4067a7f5b747db2e1ad10000c0dc14c5f4be4c47d53445a0b19a1a'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE),load_ui=False,use_scripts=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.seed=0;scene.render.threads_mode='FIXED';scene.render.threads=1;scene.render.bake.margin=8
meshes=[o for o in scene.objects if o.type=='MESH'];surfaces={}
for obj in list(scene.objects):
    if obj not in meshes:bpy.data.objects.remove(obj,do_unlink=True)
for obj in meshes:
    for mat in obj.data.materials:
        if mat.name in surfaces:continue
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
        def input_color(socket):
            if socket.is_linked:return socket.links[0].from_socket
            value=nodes.new('ShaderNodeRGB');v=socket.default_value;value.outputs[0].default_value=tuple(v) if hasattr(v,'__len__') else (v,v,v,1);return value.outputs[0]
        color=input_color(shader.inputs['Base Color']);arm=nodes.new('ShaderNodeCombineRGB');arm.inputs[0].default_value=1
        links.new(input_color(shader.inputs['Roughness']),arm.inputs[1]);links.new(input_color(shader.inputs['Metallic']),arm.inputs[2]);surfaces[mat.name]=(out,shader,nodes.new('ShaderNodeEmission'),color,arm.outputs[0])
    obj.data.uv_layers.new(name='BakeUV');obj.data.uv_layers.active_index=len(obj.data.uv_layers)-1
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
generated=[]
for channel in ['base','normal','arm']:
    atlas=bpy.data.images.new('Musket '+channel,width=1024,height=1024);atlas.colorspace_settings.name='sRGB' if channel=='base' else 'Non-Color'
    for obj in meshes:
        for mat in obj.data.materials:
            out,shader,emission,color,arm=surfaces[mat.name];links=mat.node_tree.links
            if channel=='normal':links.new(shader.outputs['BSDF'],out.inputs['Surface'])
            else:links.new(color if channel=='base' else arm,emission.inputs['Color']);links.new(emission.outputs[0],out.inputs['Surface'])
            target=mat.node_tree.nodes.new('ShaderNodeTexImage');target.image=atlas;mat.node_tree.nodes.active=target
    for i,obj in enumerate(meshes):
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;scene.render.bake.use_clear=i==0;bpy.ops.object.bake(type='NORMAL' if channel=='normal' else 'EMIT')
    output=FOLDER/('musket_'+channel+'.png');atlas.filepath_raw=str(output);atlas.file_format='PNG';atlas.save();generated.append(output)
for obj in meshes:
    while len(obj.data.uv_layers)>1:obj.data.uv_layers.remove(obj.data.uv_layers[0])
    obj.data.materials.clear()
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();mesh=meshes[0];mesh.name='Musket'
output=FOLDER/'musket.glb';bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=False);generated.append(output)
(FOLDER/'bake.json').write_text(json.dumps({'generator':'scripts/prepare-frost-musket.py','generated':[{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in generated]},indent=2)+'\n')

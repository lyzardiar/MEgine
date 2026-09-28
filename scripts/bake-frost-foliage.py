"""Author: MiYu. Blender 4.5 offline foliage cards for the game's fixed orthographic camera.
Full CC0 source geometry is rendered with transparent backgrounds; native close views retain 3D LODs.
"""
import bpy
import json
import hashlib
import math
import struct
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';path=SAMPLE/'realistic-sources.json';manifest=json.loads(path.read_text());catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());generated=[]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SAMPLE/'SourceAssets/polyhaven/fir_sapling_medium/fir_sapling_medium_1k.gltf'))
trees=[o for o in bpy.data.objects if o.type=='MESH'];assert len(trees)==3
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='Standard'
world=bpy.data.worlds.new('Overcast light');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.63,.7,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.world=world
light=bpy.data.lights.new('Sun','SUN');light.energy=2;sun=bpy.data.objects.new('Sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.6,-.4,-.5)
cam=bpy.data.cameras.new('Card camera');cam.type='ORTHO';camera=bpy.data.objects.new('Card camera',cam);scene.collection.objects.link(camera);scene.camera=camera
for tree in trees:tree.hide_render=True
for tree,key in zip(trees,['RealSpruceA','RealSpruceB','RealSpruceC']):
    tree.hide_render=False;points=[tree.matrix_world@Vector(c) for c in tree.bound_box];lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)]);center=(lo+hi)/2
    direction=Vector((0,-32,42)).normalized();camera.location=center+direction*20;camera.rotation_euler=(-direction).to_track_quat('-Z','Y').to_euler();up=Vector((0,42,32)).normalized();width=max(hi.x-lo.x,max(p.dot(up) for p in points)-min(p.dot(up) for p in points))*1.08;cam.ortho_scale=width
    texture='Assets/Textures/'+key+'-card.png';scene.render.filepath=str(SAMPLE/texture);bpy.ops.render.render(write_still=True)
    # Exclude Blender date and render-duration metadata from reproducible asset hashes.
    png=(SAMPLE/texture).read_bytes();chunks=[png[:8]];offset=8
    while offset<len(png):
        length=struct.unpack_from('>I',png,offset)[0]+12
        if png[offset+4:offset+8] not in [b'tEXt',b'iTXt',b'zTXt']:chunks.append(png[offset:offset+length])
        offset+=length
    (SAMPLE/texture).write_bytes(b''.join(chunks));generated.append(texture);tree.hide_render=True
    half=width/2;mid=Vector((0,0,(hi.z-lo.z)/2));right=Vector((1,0,0));vertices=[mid+right*x*half+up*y*half for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    mesh=bpy.data.meshes.new(key+' card');mesh.from_pydata(vertices,[],[(0,1,2,3)]);layer=mesh.uv_layers.new();coords=[(0,0),(1,0),(1,1),(0,1)]
    for i in range(4):layer.data[i].uv=coords[i]
    obj=bpy.data.objects.new(key+' card',mesh);scene.collection.objects.link(obj);bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    target='Assets/Models/'+key+'-card.glb';bpy.ops.export_scene.gltf(filepath=str(SAMPLE/target),export_format='GLB',use_selection=True,export_materials='NONE',export_yup=True,export_animations=False);generated.append(target)
    material='Assets/Materials/'+key+'-card.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':key+' canopy card','shader':'unlit','surface':'cutout','alpha_cutoff':.22,'base_color':[1,1,1,1],'base_color_texture':texture,'double_sided':True}));generated.append(material);catalog[key]['impostor']={'mesh':target,'material':material,'cameraElevation':math.degrees(math.atan2(42,32))};bpy.data.objects.remove(obj,do_unlink=True);print('Baked '+key,flush=True)
manifest['impostorGenerator']='scripts/bake-frost-foliage.py (Blender 4.5.9, fixed 52.696 degree camera)';manifest['impostors']=[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in generated];path.write_text(json.dumps(manifest,indent=2)+'\n');catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')

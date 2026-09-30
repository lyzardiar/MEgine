"""Author: MiYu. Normalize Gord Goodwin's CC0 anatomical body and bake its bone occlusion."""
import bpy
import hashlib
import json
from pathlib import Path
import urllib.request
from mathutils import Matrix

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';KEY='SkeletonBody'

def main():
    manifest_path=SAMPLE/'anatomical-skeleton-sources.json';manifest=json.loads(manifest_path.read_text())
    source=manifest['sources'][0];path=SAMPLE/source['file']
    if not path.exists():
        data=urllib.request.urlopen(source['url'],timeout=90).read()
        if hashlib.sha256(data).hexdigest()!=source['sha256']:raise ValueError('Skeleton source download hash mismatch')
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    if hashlib.sha256(path.read_bytes()).hexdigest()!=source['sha256']:raise ValueError('Skeleton source hash mismatch')
    bpy.ops.wm.open_mainfile(filepath=str(path),load_ui=False,use_scripts=False)
    if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
    scene=bpy.context.scene;rig=bpy.data.objects['Manny_Armature'];rig.animation_data_clear();rig.data.pose_position='REST'
    for bone in rig.pose.bones:
        for constraint in list(bone.constraints):bone.constraints.remove(constraint)
        bone.matrix_basis=Matrix.Identity(4)
    meshes=sorted((o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('BONES_')),key=lambda o:o.name)
    assert len(meshes)==8
    for mesh in meshes:
        for modifier in list(mesh.modifiers):
            if modifier.type!='ARMATURE':mesh.modifiers.remove(modifier)
        transform=rig.matrix_world.inverted()@mesh.matrix_world;mesh.data.transform(transform)
        if transform.determinant()<0:mesh.data.flip_normals()
        mesh.parent=rig;mesh.matrix_parent_inverse=Matrix.Identity(4);mesh.matrix_basis=Matrix.Identity(4)
    bpy.ops.object.select_all(action='DESELECT')
    for mesh in meshes:mesh.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();mesh=meshes[0];mesh.name=KEY
    bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    modifier=mesh.modifiers.new('Stable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name)
    for face in mesh.data.polygons:face.material_index=0;face.use_smooth=True
    points=[v.co.copy() for v in mesh.data.vertices];low=min(v.z for v in points);scale=3.2/(max(v.z for v in points)-low)
    rig.scale=(scale,)*3;rig.location=(0,0,-low*scale);rig.data.pose_position='POSE';bpy.context.view_layer.update()
    mesh.data.materials.clear();material=bpy.data.materials.new('Bone occlusion');material.use_nodes=True;mesh.data.materials.append(material)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
    texture='Assets/Textures/'+KEY+'_ao.png';image=bpy.data.images.new(KEY+' AO',width=1024,height=1024,alpha=False)
    image.colorspace_settings.name='sRGB';node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;material.node_tree.nodes.active=node
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.seed=0;scene.render.threads_mode='FIXED';scene.render.threads=1;scene.render.bake.margin=8
    bpy.ops.object.bake(type='AO');image.filepath_raw=str(SAMPLE/texture);image.file_format='PNG';image.save()
    model='Assets/Models/'+KEY+'.glb';rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(SAMPLE/model),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=False,export_extras=False)
    material_path='Assets/Materials/'+KEY+'.mmat';(SAMPLE/material_path).write_text(json.dumps({'version':8,'name':'Anatomical skeleton body','shader':'pbr','base_color':[.7,.66,.55,1],'base_color_texture':texture,'metallic':0,'roughness':.82,'double_sided':False}))
    size=[(max(v[i] for v in points)-min(v[i] for v in points))*scale for i in [0,2,1]]
    catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());catalog[KEY]={'material':material_path,'parts':[{'name':KEY,'mesh':model,'pivot':[0,0,0]}],'size':size,'realistic':True};catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')
    license_text='''Skeleton with rig / SkeletonBody
Author: Gord Goodwin
https://opengameart.org/content/skeleton-with-rig
Creative Commons Zero 1.0 Universal (CC0-1.0)
https://creativecommons.org/publicdomain/zero/1.0/
Original file: SourceAssets/anatomical-skeleton/fgc_skeleton.blend
MEngine adaptations: normalized scale and transforms, base mesh triangulation,
four-bone skinning, occlusion UV unwrap/bake and GLB export.
Derived files: Assets/Models/SkeletonBody.glb, Assets/Textures/SkeletonBody_ao.png,
Assets/Materials/SkeletonBody.mmat. Sources/hashes: anatomical-skeleton-sources.json.
The original rig is retained in the source. No authored animation clips are supplied.
'''
    for folder in ['Licenses','Assets/Licenses']:(SAMPLE/folder/'Gord-Goodwin-Skeleton.txt').write_bytes(license_text.encode())
    manifest['model']={'key':KEY,'triangles':len(mesh.data.polygons),'bones':len(rig.data.bones),'size':size,'animations':[]}
    manifest['generated']=[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in [model,texture,material_path]]
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n');print('Imported',KEY,manifest['model'])

if __name__=='__main__':main()

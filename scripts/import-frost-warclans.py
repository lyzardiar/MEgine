"""Author: MiYu. Blender 4.5.9: bake licensed 0 A.D. architecture into Warclans buildings."""
import bpy
import hashlib
import json
from pathlib import Path
import urllib.request
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';MANIFEST=SAMPLE/'warclans-sources.json';SOURCE=SAMPLE/'SourceAssets/0ad'

def main():
    manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
    for entry in manifest['sources']:
        target=(SAMPLE/entry['file']).resolve()
        if not target.is_relative_to(SOURCE.resolve()):raise ValueError('Source path escapes 0 A.D. assets')
        if not target.exists():
            data=urllib.request.urlopen(entry['url'],timeout=90).read()
            if hashlib.sha256(data).hexdigest()!=entry['sha256']:raise ValueError('Download changed: '+entry['file'])
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        if hashlib.sha256(target.read_bytes()).hexdigest()!=entry['sha256']:raise ValueError('Source changed: '+entry['file'])
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.seed=0;scene.render.threads_mode='FIXED';scene.render.threads=1;scene.render.bake.margin=16
    originals={};surfaces={};dimensions={}
    for role,parts in manifest['parts'].items():
        objects=[]
        for part in parts:
            before=set(bpy.data.objects);bpy.ops.wm.collada_import(filepath=str(SOURCE/'meshes'/part['mesh']))
            added=set(bpy.data.objects)-before;meshes=sorted((o for o in added if o.type=='MESH'),key=lambda o:o.name)
            if not meshes:raise ValueError('Empty source mesh: '+part['mesh'])
            for obj in meshes:
                matrix=obj.matrix_world.copy();obj.parent=None;obj.data.transform(matrix);obj.matrix_world=Matrix.Identity(4)
                uv=obj.data.uv_layers
                if not uv:raise ValueError('Missing source UVs: '+part['mesh'])
                uv[0].name='SourceUV0'
                if len(uv)>1:uv[1].name='SourceUV1'
                if 'aoTex' in part['textures'] and len(uv)<2:raise ValueError('Missing AO UVs: '+part['mesh'])
                mat=bpy.data.materials.new(role+' '+part['mesh']);mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
                out=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');shader.inputs['Metallic'].default_value=0;shader.inputs['Roughness'].default_value=.88;links.new(shader.outputs['BSDF'],out.inputs['Surface'])
                def image_node(key,noncolor=False):
                    tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(SOURCE/'textures/skins'/part['textures'][key]),check_existing=True);tex.image.alpha_mode='CHANNEL_PACKED'
                    if noncolor:tex.image.colorspace_settings.name='Non-Color'
                    coords=nodes.new('ShaderNodeUVMap');coords.uv_map='SourceUV1' if key=='aoTex' else 'SourceUV0';links.new(coords.outputs['UV'],tex.inputs['Vector']);return tex
                base=image_node('baseTex');color=base.outputs['Color']
                if part.get('material','').startswith('player_'):
                    # Source alpha is a player-color mask, not opacity. Team ownership remains in live flags/rings.
                    tint=nodes.new('ShaderNodeMixRGB');tint.inputs[1].default_value=(.48,.23,.10,1);tint.inputs[2].default_value=(1,1,1,1);links.new(base.outputs['Alpha'],tint.inputs[0])
                    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;links.new(color,multiply.inputs[1]);links.new(tint.outputs[0],multiply.inputs[2]);color=multiply.outputs[0]
                links.new(color,shader.inputs['Base Color'])
                if 'normTex' in part['textures']:
                    normal=image_node('normTex',True);mapping=nodes.new('ShaderNodeNormalMap');mapping.uv_map='SourceUV0';links.new(normal.outputs['Color'],mapping.inputs['Color']);links.new(mapping.outputs['Normal'],shader.inputs['Normal'])
                arm=nodes.new('ShaderNodeCombineRGB');arm.inputs[0].default_value=1;arm.inputs[1].default_value=.88;arm.inputs[2].default_value=0
                if 'aoTex' in part['textures']:links.new(image_node('aoTex',True).outputs['Color'],arm.inputs[0])
                if 'specTex' in part['textures']:
                    spec=image_node('specTex',True);rough=nodes.new('ShaderNodeMath');rough.operation='MULTIPLY_ADD';rough.inputs[1].default_value=-.45;rough.inputs[2].default_value=.92;links.new(spec.outputs['Color'],rough.inputs[0]);links.new(rough.outputs[0],arm.inputs[1])
                emission=nodes.new('ShaderNodeEmission');surfaces[mat.name]=(out,shader,emission,color,arm.outputs[0]);obj.data.materials.clear();obj.data.materials.append(mat);objects.append(obj)
            for obj in added:
                if obj.type!='MESH':bpy.data.objects.remove(obj,do_unlink=True)
        points=[v.co for o in objects for v in o.data.vertices];lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)]);width=max(hi.x-lo.x,hi.y-lo.y);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));dimensions[role]=list(hi-lo)
        if width<1e-6:raise ValueError('Invalid source bounds')
        for obj in objects:
            for v in obj.data.vertices:v.co=(v.co-center)/width
            obj.hide_render=True;obj.hide_set(True)
        originals[role]=objects
    catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());generated=[];stats={}
    for key,layout in manifest['models'].items():
        bpy.ops.object.select_all(action='DESELECT');copies=[]
        for item in layout:
            x,y,z=item['position']
            for original in originals[item['role']]:
                obj=original.copy();obj.data=original.data.copy();scene.collection.objects.link(obj);obj.hide_render=False;obj.hide_set(False)
                for v in obj.data.vertices:v.co=v.co*item['scale']+Vector((x,-z,y))
                obj.select_set(True);copies.append(obj)
        bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();obj=copies[0];obj.name='Real'+key
        points=[v.co for v in obj.data.vertices];center=Vector([(min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)]);center.z=min(p.z for p in points)
        for v in obj.data.vertices:v.co-=center
        modifier=obj.modifiers.new('Stable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.data.uv_layers.new(name='BakeUV');obj.data.uv_layers.active_index=len(obj.data.uv_layers)-1
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT')
        textures={}
        for channel in ['base','normal','arm']:
            atlas=bpy.data.images.new(key+' '+channel,width=1024,height=1024,alpha=False);atlas.colorspace_settings.name='sRGB' if channel=='base' else 'Non-Color'
            for mat in obj.data.materials:
                nodes=mat.node_tree.nodes;links=mat.node_tree.links;out,shader,emission,color,arm=surfaces[mat.name]
                if channel=='normal':links.new(shader.outputs['BSDF'],out.inputs['Surface'])
                else:links.new(color if channel=='base' else arm,emission.inputs['Color']);links.new(emission.outputs[0],out.inputs['Surface'])
                target=nodes.new('ShaderNodeTexImage');target.image=atlas;nodes.active=target
            bpy.ops.object.bake(type='NORMAL' if channel=='normal' else 'EMIT')
            path='Assets/Textures/Real'+key+'_'+channel+'.png';atlas.filepath_raw=str(SAMPLE/path);atlas.file_format='PNG';atlas.save();textures[channel]=path;generated.append(path)
        while len(obj.data.uv_layers)>1:obj.data.uv_layers.remove(obj.data.uv_layers[0])
        for polygon in obj.data.polygons:polygon.material_index=0
        obj.data.materials.clear();obj.data.materials.append(bpy.data.materials.new('Baked '+key))
        mesh='Assets/Models/Real'+key+'.glb';bpy.ops.export_scene.gltf(filepath=str(SAMPLE/mesh),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=False,export_extras=False);generated.append(mesh)
        material='Assets/Materials/Real'+key+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':'Timber and thatch '+key,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':textures['base'],'normal_texture':textures['normal'],'normal_scale':1,'metallic_roughness_texture':textures['arm'],'occlusion_texture':textures['arm'],'occlusion_strength':.65,'metallic':0,'roughness':1,'double_sided':True}),encoding='utf-8');generated.append(material)
        points=[v.co for v in obj.data.vertices];size=[max(p[i] for p in points)-min(p[i] for p in points) for i in (0,2,1)]
        catalog[key]={'material':material,'parts':[{'name':key,'mesh':mesh,'pivot':[0,0,0]}],'size':size,'factionBuilding':True,'realistic':True};stats[key]={'triangles':len(obj.data.polygons),'size':size};bpy.data.objects.remove(obj,do_unlink=True);print('Imported '+key,stats[key],flush=True)
    manifest['sourceDimensions']=dimensions;manifest['modelStats']=stats;manifest['generated']=[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in generated];MANIFEST.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');catalog_path.write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()

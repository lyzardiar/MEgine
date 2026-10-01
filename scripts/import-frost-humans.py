"""Author: MiYu. Blender 4.5.9: assemble and animate licensed 0 A.D. units and machinery."""
import argparse
from array import array
import bpy
import hashlib
import json
import math
import sys
import tempfile
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[1];SAMPLE=ROOT/'samples/frostbound-realms';SOURCE=SAMPLE/'SourceAssets/0ad';MANIFEST=SAMPLE/'human-sources.json'

def import_dae(path):
    if path.endswith('.glb'):
        before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(SOURCE/path));return sorted(set(bpy.data.objects)-before,key=lambda o:o.name)
    document=ET.parse(SOURCE/path);changed=False
    if 'animation/' in path:
        for texture in document.findall('.//{*}library_effects//{*}texture'):
            if 'texcoord' not in texture.attrib:texture.set('texcoord','UVMap');changed=True
    for scene in document.findall('{*}library_visual_scenes/{*}visual_scene'):
        seen={}
        for node in scene.findall('{*}node'):
            identity=node.get('id');signature=[(e.tag,e.attrib,(e.text or '').strip()) for e in node.iter()]
            if identity in seen:
                if seen[identity]!=signature:raise ValueError('Conflicting duplicate Collada node: '+identity)
                scene.remove(node);changed=True
            else:seen[identity]=signature
    before=set(bpy.data.objects)
    if changed:
        # Repair duplicate source skeletons and unused animation texture declarations without changing source bytes.
        with tempfile.TemporaryDirectory() as folder:
            clean=Path(folder)/'deduplicated.dae';ET.register_namespace('','http://www.collada.org/2005/11/COLLADASchema');document.write(clean,encoding='utf-8',xml_declaration=True);bpy.ops.wm.collada_import(filepath=str(clean))
    else:bpy.ops.wm.collada_import(filepath=str(SOURCE/path))
    objects=sorted(set(bpy.data.objects)-before,key=lambda o:o.name)
    # 0 A.D. props use the same authored coordinates as bodies despite legacy inch/centimeter metadata.
    unit=document.find('{*}asset/{*}unit');meter=float(unit.get('meter','1')) if unit is not None else 1
    for obj in objects:
        if obj.parent not in objects:obj.matrix_world=Matrix.Scale(1/meter,4)@obj.matrix_world
    bpy.context.view_layer.update()
    return objects

def attachment_matrices(path):
    doc=ET.parse(SOURCE/path);ns={'c':'http://www.collada.org/2005/11/COLLADASchema'};result={}
    assert doc.findtext('c:asset/c:up_axis',namespaces=ns)=='Z_UP'
    def visit(node,parent):
        local=Matrix.Identity(4)
        for item in node:
            kind=item.tag.rsplit('}',1)[-1]
            if kind not in ['matrix','translate','rotate','scale']:
                if kind in ['lookat','skew']:raise ValueError('Unsupported Collada transform: '+kind)
                continue
            values=[float(x) for x in item.text.split()]
            transform=Matrix([values[i:i+4] for i in range(0,16,4)]) if kind=='matrix' else Matrix.Translation(Vector(values)) if kind=='translate' else Matrix.Rotation(math.radians(values[3]),4,Vector(values[:3])) if kind=='rotate' else Matrix.Diagonal(Vector(values+[1]))
            local=local@transform
        world=parent@local
        result[node.get('name')]=world
        for child in node.findall('c:node',ns):visit(child,world)
    for node in doc.findall('c:library_visual_scenes/c:visual_scene/c:node',ns):visit(node,Matrix.Identity(4))
    return result

def main():
    global SOURCE
    manifest=json.loads(MANIFEST.read_text())
    SOURCE=(SAMPLE/manifest.get('sourceRoot','SourceAssets/0ad')).resolve()
    if not SOURCE.is_relative_to((SAMPLE/'SourceAssets').resolve()):raise ValueError('Source root escapes sample sources')
    for entry in manifest['sources']:
        target=(SAMPLE/entry['file']).resolve()
        if not target.is_relative_to(SOURCE.resolve()):raise ValueError('Source escapes manifest directory')
        if not target.exists():
            if 'url' not in entry:raise FileNotFoundError('Run the manifest preparation script first: '+entry['file'])
            data=urllib.request.urlopen(entry['url'],timeout=90).read()
            if hashlib.sha256(data).hexdigest()!=entry['sha256']:raise ValueError('Download hash mismatch')
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        if hashlib.sha256(target.read_bytes()).hexdigest()!=entry['sha256']:raise ValueError('Source hash mismatch: '+entry['file'])
    catalog_path=SAMPLE/'model-catalog.json';catalog=json.loads(catalog_path.read_text());generated=[];stats={}
    for key,definition in manifest['models'].items():
        bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
        for action in list(bpy.data.actions):bpy.data.actions.remove(action)
        scene=bpy.context.scene;scene.frame_start=0;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.seed=0;scene.render.threads_mode='FIXED';scene.render.threads=1;scene.render.bake.margin=12
        body=definition['parts'][0];objects=import_dae(body['mesh']);rig=max((o for o in objects if o.type=='ARMATURE'),key=lambda o:len(o.data.bones));rig.name=key+'Rig';rig.data.pose_position='REST'
        matrices=attachment_matrices(body.get('attachmentSource',body['mesh']));meshes=[];surfaces={};props=[];body_points=[]
        for index,part in enumerate(definition['parts']):
            added=objects if index==0 else import_dae(part['mesh'])
            assert any(o.type=='MESH' and len(o.data.polygons)>0 for o in added),'Missing mesh geometry: '+part['mesh']
            if part.get('skeletal'):
                prop_rig=max((o for o in added if o.type=='ARMATURE'),key=lambda o:len(o.data.bones));placement=matrices[part['bone']]@prop_rig.matrix_world
                prefix=part.get('prefix','');bones={prefix+b.name:{'source':b.name,'matrix':b.matrix_local.copy(),'length':b.length,'parent':prefix+b.parent.name if b.parent else part['bone']} for b in prop_rig.data.bones}
                assert not set(bones).intersection(rig.data.bones.keys()),'Equipment bones must have unique names'
                if prefix:
                    for obj in added:
                        if obj.type=='MESH':
                            for group in obj.vertex_groups:group.name=prefix+group.name
                    for name,matrix in attachment_matrices(part['mesh']).items():matrices[prefix+name]=matrices[part['bone']]@matrix
                bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
                for name,b in bones.items():
                    new=rig.data.edit_bones.new(name);new.length=b['length']*placement.to_scale().length/(3**.5);new.matrix=placement@b['matrix']
                for name,b in bones.items():rig.data.edit_bones[name].parent=rig.data.edit_bones[b['parent']]
                bpy.ops.object.mode_set(mode='OBJECT');props.append({'part':part,'bones':bones,'placement':placement})
                if prefix:
                    for bone,b in bones.items():
                        expected=placement@b['matrix'];actual=rig.data.bones[bone].matrix_local
                        assert max(abs(expected[i][j]-actual[i][j]) for i in range(4) for j in range(4))<.001,(bone,expected,actual)
            for obj in [o for o in added if o.type=='MESH']:
                matrix=obj.matrix_world.copy();obj.parent=None;obj.data.transform(matrix);obj.matrix_world=Matrix.Identity(4)
                if 'transform' in part:obj.data.transform(Matrix(part['transform']))
                if index==0:body_points.extend(v.co.copy() for v in obj.data.vertices)
                if part['bone']:
                    bone=part['bone'];assert bone in rig.data.bones and bone in matrices,(bone,bone in rig.data.bones,bone in matrices)
                    obj.data.transform(matrices[bone])
                    if not part.get('skeletal'):obj.vertex_groups.clear();obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))),1,'REPLACE')
                obj.parent=rig;obj.matrix_parent_inverse=Matrix.Identity(4);obj.modifiers.clear();modifier=obj.modifiers.new('Authored skeleton','ARMATURE');modifier.object=rig
                obj.data.uv_layers[0].name='SourceUV';mat=bpy.data.materials.new(key+' '+str(index));mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
                out=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');shader.inputs['Roughness'].default_value=.8;links.new(shader.outputs['BSDF'],out.inputs['Surface'])
                def texture(path,noncolor=False):
                    node=nodes.new('ShaderNodeTexImage');node.image=bpy.data.images.load(str(SOURCE/path),check_existing=True);node.image.alpha_mode='CHANNEL_PACKED'
                    if noncolor:node.image.colorspace_settings.name='Non-Color'
                    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='SourceUV';links.new(uv.outputs['UV'],node.inputs['Vector']);return node
                base=texture(part['base']);color=base.outputs['Color']
                if part['tint']:
                    # Original alpha masks player/object color; it is not cutout opacity.
                    tint=nodes.new('ShaderNodeMixRGB');tint.inputs[1].default_value=(*part['tint'],1);tint.inputs[2].default_value=(1,1,1,1);links.new(base.outputs['Alpha'],tint.inputs[0])
                    mult=nodes.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1;links.new(color,mult.inputs[1]);links.new(tint.outputs[0],mult.inputs[2]);color=mult.outputs[0]
                links.new(color,shader.inputs['Base Color'])
                if part.get('normal'):
                    normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='SourceUV';links.new(texture(part['normal'],True).outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
                arm=nodes.new('ShaderNodeCombineRGB');arm.inputs[0].default_value=1;arm.inputs[1].default_value=.8;arm.inputs[2].default_value=0
                if part.get('specular'):
                    rough=nodes.new('ShaderNodeMath');rough.operation='MULTIPLY_ADD';rough.inputs[1].default_value=-.5;rough.inputs[2].default_value=.9;links.new(texture(part['specular'],True).outputs['Color'],rough.inputs[0]);links.new(rough.outputs[0],arm.inputs[1])
                arm_color=texture(part['arm'],True).outputs['Color'] if part.get('arm') else arm.outputs[0]
                opacity=base.outputs['Alpha'] if part.get('cutout') else nodes.new('ShaderNodeValue').outputs[0]
                if not part.get('cutout'):opacity.default_value=1
                emission=nodes.new('ShaderNodeEmission');surfaces[mat.name]=(out,shader,emission,color,arm_color,opacity);obj.data.materials.clear();obj.data.materials.append(mat);meshes.append(obj)
            for obj in added:
                if obj.type!='MESH' and obj!=rig:bpy.data.objects.remove(obj,do_unlink=True)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:obj.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();mesh=meshes[0];mesh.name=key
        modifier=mesh.modifiers.new('Stable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name)
        mesh.data.uv_layers.new(name='BakeUV');mesh.data.uv_layers.active_index=len(mesh.data.uv_layers)-1
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.014);bpy.ops.object.mode_set(mode='OBJECT')
        textures={};cutout=any(p.get('cutout') for p in definition['parts']);base_atlas=None
        for channel in ['base','normal','arm']+(['alpha'] if cutout else []):
            atlas=bpy.data.images.new(key+' '+channel,width=1024,height=1024,alpha=cutout and channel=='base');atlas.colorspace_settings.name='sRGB' if channel=='base' else 'Non-Color'
            if cutout and channel=='base':atlas.alpha_mode='CHANNEL_PACKED';base_atlas=atlas
            for mat in mesh.data.materials:
                out,shader,emission,color,arm,opacity=surfaces[mat.name];links=mat.node_tree.links
                if channel=='normal':links.new(shader.outputs['BSDF'],out.inputs['Surface'])
                else:links.new(color if channel=='base' else opacity if channel=='alpha' else arm,emission.inputs['Color']);links.new(emission.outputs[0],out.inputs['Surface'])
                target=mat.node_tree.nodes.new('ShaderNodeTexImage');target.image=atlas;mat.node_tree.nodes.active=target
            bpy.ops.object.bake(type='NORMAL' if channel=='normal' else 'EMIT')
            if channel=='alpha':
                rgba=array('f',[0])*len(base_atlas.pixels);mask=array('f',[0])*len(atlas.pixels);base_atlas.pixels.foreach_get(rgba);atlas.pixels.foreach_get(mask);rgba[3::4]=mask[0::4];base_atlas.pixels.foreach_set(rgba);base_atlas.save();continue
            path='Assets/Textures/'+key+'_'+channel+'.png';atlas.filepath_raw=str(SAMPLE/path);atlas.file_format='PNG';atlas.save();textures[channel]=path;generated.append(path)
        while len(mesh.data.uv_layers)>1:mesh.data.uv_layers.remove(mesh.data.uv_layers[0])
        for face in mesh.data.polygons:face.material_index=0
        mesh.data.materials.clear();mesh.data.materials.append(bpy.data.materials.new(key+' atlas'))
        points=[v.co for v in mesh.data.vertices];reference=body_points if definition.get('width') else points;low=min(p.z for p in reference);scale=definition['width']/max(max(p[i] for p in reference)-min(p[i] for p in reference) for i in [0,1]) if definition.get('width') else definition.get('height',3)/(max(p.z for p in points)-low);rig.scale=(scale,)*3;rig.location.z=-low*scale;rig.data.pose_position='POSE';rig.animation_data_create()
        clips=[];muzzle=None
        for name,path in definition['animations'].items():
            added=import_dae(path);animated=max((o for o in added if o.type=='ARMATURE'),key=lambda o:len(o.data.bones));source_action=animated.animation_data.action;start,end=source_action.frame_range
            if name in definition.get('animationRanges',{}):
                low,high=definition['animationRanges'][name];assert 0<=low<high<=1;start,end=round(start+(end-start)*low),round(start+(end-start)*high)
            weighted={mesh.vertex_groups[g.group].name for v in mesh.data.vertices for g in v.groups if g.weight>0}
            prop_bones={name for prop in props for name in prop['bones']}
            assert all(name in animated.pose.bones for name in weighted-prop_bones),'Animation is missing a weighted body or equipment bone'
            equipment=[]
            for prop in props:
                clip=prop['part'].get('animations',{}).get(name)
                if not clip:equipment.append((prop,None,None,None));continue
                extra=import_dae(clip);added.extend(extra);moving=max((o for o in extra if o.type=='ARMATURE'),key=lambda o:len(o.data.bones));assert all(b['source'] in moving.pose.bones for bone,b in prop['bones'].items() if bone in weighted),clip
                equipment.append((prop,moving,moving.animation_data.action.frame_range,moving.matrix_world.copy()))
            body_end=end
            if name in ['Idle','Walk']:end=start+max([end-start]+[extent[1]-extent[0] for _,moving,extent,_ in equipment if moving])
            action=bpy.data.actions.new(name);rig.animation_data.action=action
            # Include the authored armature transform before baking deformation into the mesh rig's rest basis.
            for frame in range(int(start),int(end)+1):
                sample=start+(frame-start)/(end-start)*(body_end-start) if end!=body_end else frame;scene.frame_set(int(sample),subframe=sample-int(sample));desired={}
                for bone in rig.data.bones:
                    source_bone=animated.pose.bones.get(bone.name)
                    desired[bone.name]=animated.matrix_world@source_bone.matrix@source_bone.bone.matrix_local.inverted()@bone.matrix_local if source_bone else bone.matrix_local
                for prop,moving,extent,world in equipment:
                    attach=prop['part']['bone'];deform=desired[attach]@rig.data.bones[attach].matrix_local.inverted();placement=prop['placement']
                    if moving:
                        sample=extent[0]+(frame-start)/(end-start)*(extent[1]-extent[0]);scene.frame_set(int(sample),subframe=sample-int(sample))
                    for bone,rest in prop['bones'].items():
                        pose=moving.pose.bones.get(rest['source']) if moving else None
                        if moving and pose is None:
                            parent=rest['parent'];desired[bone]=desired[parent]@rig.data.bones[parent].matrix_local.inverted()@rig.data.bones[bone].matrix_local;continue
                        local=world.inverted()@moving.matrix_world@pose.matrix@pose.bone.matrix_local.inverted()@rest['matrix'] if moving else rest['matrix']
                        desired[bone]=deform@placement@local
                for pose in rig.pose.bones:
                    bone=pose.bone;parent=bone.parent
                    basis=bone.convert_local_to_pose(desired[bone.name],bone.matrix_local,parent_matrix=desired[parent.name] if parent else Matrix.Identity(4),parent_matrix_local=parent.matrix_local if parent else Matrix.Identity(4),invert=True)
                    pose.rotation_mode='QUATERNION';pose.matrix_basis=basis
                    for channel in ['location','rotation_quaternion','scale']:pose.keyframe_insert(channel,frame=frame-int(start))
                if name in definition.get('groundClips',[]):
                    bpy.context.view_layer.update();evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());lift=max(0,-min((evaluated.matrix_world@v.co).z for v in evaluated.data.vertices))/rig.scale.z
                    for matrix in desired.values():matrix.translation.z+=lift
                    for pose in rig.pose.bones:
                        bone=pose.bone;parent=bone.parent;pose.matrix_basis=bone.convert_local_to_pose(desired[bone.name],bone.matrix_local,parent_matrix=desired[parent.name] if parent else Matrix.Identity(4),parent_matrix_local=parent.matrix_local if parent else Matrix.Identity(4),invert=True)
                        pose.keyframe_insert('location',frame=frame-int(start))
                if name=='Rifle_Shoot' and frame==round(start+(end-start)*definition['attackEvent']):
                    part=next(p for p in definition['parts'] if 'muzzle' in p);bone=part['bone'];point=rig.matrix_world@desired[bone]@rig.data.bones[bone].matrix_local.inverted()@matrices[bone]@Matrix(part['transform'])@Vector(part['muzzle']);muzzle=[point.x,point.z,-point.y]
            for curve in action.fcurves:
                for point in curve.keyframe_points:point.interpolation='LINEAR'
            rig.animation_data.action=None;track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,0,action);clips.append({'name':name,'frames':max(1,round((end-start)/scene.render.fps*12))})
            for obj in added:bpy.data.objects.remove(obj,do_unlink=True)
        for bone in rig.data.bones:bone.use_deform=True
        bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
        model='Assets/Models/'+key+'.glb';bpy.ops.export_scene.gltf(filepath=str(SAMPLE/model),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_optimize_animation_size=False,export_extras=False)
        material='Assets/Materials/'+key+'.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':key,'shader':'pbr','base_color':[1,1,1,1],'base_color_texture':textures['base'],'normal_texture':textures['normal'],'normal_scale':1,'metallic_roughness_texture':textures['arm'],'occlusion_texture':textures['arm'],'metallic':0,'roughness':1,'double_sided':True}))
        if any(p.get('arm') for p in definition['parts']):
            value=json.loads((SAMPLE/material).read_text());value['metallic']=1;(SAMPLE/material).write_text(json.dumps(value))
        if cutout:
            value=json.loads((SAMPLE/material).read_text());value.update(surface='cutout',alpha_cutoff=.3);(SAMPLE/material).write_text(json.dumps(value))
        generated.extend([model,material]);size=[(max(p[i] for p in points)-min(p[i] for p in points))*scale for i in [0,2,1]]
        catalog[key]={'material':material,'parts':[{'name':key,'mesh':model,'pivot':[0,0,0]}],'animations':clips,'size':size,'realistic':True}
        if muzzle is not None:catalog[key]['muzzle']=muzzle
        if definition.get('workAnimation'):catalog[key]['workAnimation']=definition['workAnimation']
        for field in ['attackEvent','ammoLoad','siegeModel','shotModel','loadedModel','crewCount','mountedModel']:
            if field in definition:catalog[key][field]=definition[field]
        stats[key]={'triangles':len(mesh.data.polygons),'bones':len(rig.data.bones),'clips':clips,'size':size};print('Imported',key,stats[key],flush=True)
    if manifest.get('projectile'):
        part=manifest['projectile'];bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
        objects=import_dae(part['mesh']);arrow=next(o for o in objects if o.type=='MESH');arrow.data.transform(arrow.matrix_world);arrow.parent=None;arrow.matrix_world=Matrix.Identity(4)
        low=min(v.co.z for v in arrow.data.vertices);high=max(v.co.z for v in arrow.data.vertices)
        arrow.data.transform(Matrix.Rotation(math.pi/2,4,'X')@Matrix.Scale(1.5/(high-low),4)@Matrix.Translation((0,0,-(low+high)/2)))
        bpy.ops.object.select_all(action='DESELECT');arrow.select_set(True);bpy.context.view_layer.objects.active=arrow
        model='Assets/Models/RealArrow.glb';bpy.ops.export_scene.gltf(filepath=str(SAMPLE/model),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=False)
        texture='Assets/Textures/RealArrow_base.png';base=bpy.data.images.load(str(SOURCE/part['base']),check_existing=False);base.alpha_mode='CHANNEL_PACKED';assert len(base.pixels)>0;base.filepath_raw=str(SAMPLE/texture);base.file_format='PNG';base.save()
        material='Assets/Materials/RealArrow.mmat';(SAMPLE/material).write_text(json.dumps({'version':8,'name':'RealArrow','shader':'pbr','base_color':[1,1,1,1],'base_color_texture':texture,'metallic':0,'roughness':.8,'double_sided':True}))
        generated.extend([model,texture,material]);catalog['RealArrow']={'material':material,'parts':[{'name':'RealArrow','mesh':model,'pivot':[0,0,0]}],'size':[.11,.11,1.5],'realistic':True}
    manifest['modelStats']=stats;manifest['generated']=[{'file':p,'sha256':hashlib.sha256((SAMPLE/p).read_bytes()).hexdigest()} for p in generated];MANIFEST.write_text(json.dumps(manifest,indent=2)+'\n');catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--manifest',default='human-sources.json');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    MANIFEST=(SAMPLE/args.manifest).resolve()
    if MANIFEST.parent!=SAMPLE.resolve():raise ValueError('Manifest must belong to the sample root')
    main()

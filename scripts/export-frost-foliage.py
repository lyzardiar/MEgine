"""Author: MiYu. Export textured 3D foliage LODs, preserving leaf surfaces during decimation."""
import bpy
import argparse
import json
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
parser=argparse.ArgumentParser();parser.add_argument('target');parser.add_argument('--asset',default='fir_sapling_medium');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
asset=next(a for a in json.loads((sample/'realistic-sources.json').read_text())['assets'] if a['id']==args.asset)
bpy.ops.wm.open_mainfile(filepath=str(sample/asset['blend']),load_ui=False)
if asset.get('decimate'):
    source=bpy.data.objects[asset['decimate']['source']]
    for name,ratio in zip(asset['lod_nodes'][0],asset['decimate']['ratios'],strict=True):
        obj=source.copy();obj.data=source.data.copy();obj.name=name;bpy.context.collection.objects.link(obj);obj.hide_set(False);obj.hide_viewport=False;bpy.context.view_layer.objects.active=obj
        modifier=obj.modifiers.new('Game foliage LOD','DECIMATE');modifier.ratio=ratio;bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.object.select_all(action='DESELECT')
names=[name for pair in asset['lod_nodes'] for name in pair]
for name in names:
    obj=bpy.data.objects[name]
    for collection in obj.users_collection:collection.hide_viewport=False
    obj.hide_set(False);obj.hide_viewport=False;obj.select_set(True)
assert {obj.name for obj in bpy.context.selected_objects}==set(names)
for image in bpy.data.images:
    if image.source=='FILE' and image.filepath and not Path(bpy.path.abspath(image.filepath)).is_file():raise ValueError('Missing source texture '+image.filepath)
target=Path(args.target);target.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLTF_SEPARATE',export_texture_dir='textures',use_selection=True,export_animations=False,export_yup=True)
print('Exported foliage LODs: '+', '.join(names),flush=True)

"""Author: MiYu. Export the author's three-dimensional game LODs and RGBA twig textures."""
import bpy
import json
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[1];sample=root/'samples/frostbound-realms'
asset=next(a for a in json.loads((sample/'realistic-sources.json').read_text())['assets'] if a['id']=='fir_sapling_medium')
bpy.ops.wm.open_mainfile(filepath=str(sample/asset['blend']),load_ui=False)
bpy.ops.object.select_all(action='DESELECT')
names=[name for pair in asset['lod_nodes'] for name in pair]
for name in names:
    obj=bpy.data.objects[name]
    for collection in obj.users_collection:collection.hide_viewport=False
    obj.hide_set(False);obj.hide_viewport=False;obj.select_set(True)
assert {obj.name for obj in bpy.context.selected_objects}==set(names)
for image in bpy.data.images:
    if image.source=='FILE' and image.filepath and not Path(bpy.path.abspath(image.filepath)).is_file():raise ValueError('Missing source texture '+image.filepath)
target=Path(sys.argv[sys.argv.index('--')+1]);target.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLTF_SEPARATE',export_texture_dir='textures',use_selection=True,export_animations=False,export_yup=True)
print('Exported authored foliage LODs: '+', '.join(names),flush=True)

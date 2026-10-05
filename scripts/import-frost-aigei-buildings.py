"""Author: MiYu. Import the user supplied Warcraft scenery MAX archive using Blender 4.5."""
import bpy
import hashlib
import importlib.util
import json
import math
import urllib.request
import zipfile
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
CACHE = ROOT / 'tmp/aigei-warcraft-buildings/reproducible'
ARCHIVE = SAMPLE / 'SourceAssets/aigei-warcraft-buildings.zip'
ARCHIVE_SHA = 'c08dd860fa7c6af229637391eec893eadf5ffa165a7edd9c1e48481171e6552e'
IMPORTER_COMMIT = '37db107126f956f7219152671443080360565691'
IMPORTER_SHA = '1b786ebe82d2a1c0df273514af449e8b91430672abafde3de4ee634f2432320d'
IMPORTER_URL = f'https://raw.githubusercontent.com/nrgsille76/io_scene_max/{IMPORTER_COMMIT}/source/import_max.py'
REPLACEMENTS = {
    'KingdomHall': ['CityBuilding111'],
    'KingdomHall2': ['DalaranBuilding01'],
    'KingdomHall3': ['DalaranVioletCitadel1'],
    'KingdomBarracks': ['CityBuilding101'],
    'KingdomLodge': ['VillageBuilding01', 'VillageBuilding02'],
    'KingdomTower': ['DalaranBuilding11'],
    'KingdomAltar': ['City_Statue1'],
    'KingdomWorkshop': ['CityBuilding131'],
    'KingdomArcaneVault': ['ElvenVillageBuilding71', 'ElvenVillageBuilding72'],
    'WildwoodLodge': ['ElvenVillageBuilding01'],
}
SCENERY = {
    'AigeiCityHouse': ['CityBuilding121'],
    'AigeiCityHouseTall': ['MoreCityBuilding51'],
    'AigeiVillageTower': ['VillageBuilding11'],
    'AigeiVillageHouse': ['VillageBuilding21'],
    'AigeiElvenTower': ['ElvenVillageBuilding11', 'ElvenVillageBuilding12'],
    'AigeiCityRuin': ['CityBuildingLarge_01', 'CityBuildingLarge_02'],
    'AigeiCityRuinSmall': ['CityBuildingSmall0_01', 'CityBuildingSmall0_02'],
    'AigeiArcheryRange': ['ArcheryRange1', 'ArcheryRange2'],
    'AigeiWoodBridge': ['WoodBridgeLarge451', 'WoodBridgeLarge452'],
    'AigeiWoodBridgeSmall': ['WoodBridgeSmall01', 'WoodBridgeSmall02'],
    'AigeiStoneBridge': ['CityBridgeLarge901', 'CityBridgeLarge902'],
    'AigeiStoneBridgeSmall': ['CityBridgeSmall901'],
    'AigeiRuinedBridge': ['CityBridgeLarge45Destroyed1', 'CityBridgeLarge45Destroyed2'],
    'AigeiStoneWall': ['StoneWall9001'],
    'AigeiRuinedWall': ['RuinedWall1'],
    'AigeiRuinedArch': ['RuinedArch01'],
    'AigeiArchway': ['Archway11'],
    'AigeiObelisk': ['AshenObilisk1'],
    'AigeiGrave': ['CityGrave01'],
    'AigeiGraveCross': ['CityGrave31'],
    'AigeiOak': ['AshenTree01'],
    'AigeiOakTall': ['AshenTree42'],
    'AigeiSnowTree': ['AshenTree82'],
    'AigeiBarrensTree': ['BarrensTree22'],
    'AigeiMushroomTree': ['Shrooms01'],
    'AigeiCactus': ['Cactus01'],
    'AigeiRock': ['AshenRock31'],
    'AigeiRockPillar': ['RockPillar01'],
    'AigeiRockArch': ['A_RockArch1'],
    'AigeiShrub': ['AshenBush01'],
    'AigeiSkullPile': ['SkullPile01'],
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if sha(ARCHIVE) != ARCHIVE_SHA:
        raise ValueError('User archive SHA-256 mismatch')
    CACHE.mkdir(parents=True, exist_ok=True)
    importer = CACHE / 'import_max.py'
    if not importer.exists():
        importer.write_bytes(urllib.request.urlopen(IMPORTER_URL, timeout=40).read())
    if sha(importer) != IMPORTER_SHA:
        raise ValueError('Pinned MAX importer SHA-256 mismatch')
    folder = CACHE / 'source'
    folder.mkdir(exist_ok=True)
    with zipfile.ZipFile(ARCHIVE) as archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            # The original archive contains GBK names without the UTF-8 ZIP flag.
            name = entry.filename
            if not entry.flag_bits & 0x800:
                try:
                    name = name.encode('cp437').decode('gbk')
                except (UnicodeEncodeError, UnicodeDecodeError):
                    pass
            target = (folder / name).resolve()
            if not target.is_relative_to(folder.resolve()):
                raise ValueError('Archive path escapes destination')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(entry))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    spec = importlib.util.spec_from_file_location('frost_max_importer', importer)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.load(None, bpy.context, filepath=str(next(folder.rglob('*.max'))))
    original = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH'}
    source_stats = [{'name': o.name, 'vertices': len(o.data.vertices), 'faces': len(o.data.polygons)} for o in original.values()]
    catalog_path = SAMPLE / 'model-catalog.json'
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
    generated = []
    mappings = {}
    for key, names in (REPLACEMENTS | SCENERY).items():
        source_objects = [original[name] for name in names]
        # Each model keeps a single runtime material; texture tiles have padded borders.
        images = {}
        for obj in source_objects:
            if not obj.data.uv_layers:
                raise ValueError('Missing original UVs: ' + obj.name)
            for mat in obj.data.materials:
                nodes = [n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
                if not nodes:
                    raise ValueError('Missing original texture: ' + obj.name)
                images[mat.name] = nodes[0].image
        unique = sorted(set(images.values()), key=lambda image: image.name)
        # Blender image pixels use a bottom-left origin, matching the source UVs.
        import numpy as np
        count = len(unique)
        cols = math.ceil(math.sqrt(count))
        rows = math.ceil(count / cols)
        cell = 544
        atlas_pixels = np.zeros((rows * cell, cols * cell, 4), dtype=np.float32)
        tiles = {}
        for i, image in enumerate(unique):
            image.reload()
            source_pixels = np.empty(image.size[0] * image.size[1] * 4, dtype=np.float32)
            image.pixels.foreach_get(source_pixels)
            texture = bpy.data.images.new('Texture tile', width=image.size[0], height=image.size[1], alpha=True)
            texture.pixels.foreach_set(source_pixels)
            texture.scale(512, 512)
            pixels = np.empty(512 * 512 * 4, dtype=np.float32)
            texture.pixels.foreach_get(pixels)
            x, y = (i % cols) * cell, (i // cols) * cell
            atlas_pixels[y:y + cell, x:x + cell] = np.pad(pixels.reshape(512, 512, 4), ((16, 16), (16, 16), (0, 0)), mode='edge')
            tiles[image.name] = (x + 16, y + 16)
            bpy.data.images.remove(texture)
        texture_path = 'Assets/Textures/' + key + '-warcraft.png'
        atlas = bpy.data.images.new(key + ' original textures', width=512 if count == 1 else cols * cell, height=512 if count == 1 else rows * cell, alpha=True)
        atlas.pixels.foreach_set((atlas_pixels[16:528, 16:528] if count == 1 else atlas_pixels).ravel())
        atlas.filepath_raw = str(SAMPLE / texture_path)
        atlas.file_format = 'PNG'
        atlas.save()
        points = [obj.matrix_world @ v.co for obj in source_objects for v in obj.data.vertices]
        lo = Vector([min(p[i] for p in points) for i in range(3)])
        hi = Vector([max(p[i] for p in points) for i in range(3)])
        center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
        scale = 5 / max(hi - lo)
        bpy.ops.object.select_all(action='DESELECT')
        copies = []
        for obj in source_objects:
            copy = bpy.data.objects.new(key + ' part', obj.data.copy())
            bpy.context.collection.objects.link(copy)
            for vertex, source_vertex in zip(copy.data.vertices, obj.data.vertices):
                vertex.co = (obj.matrix_world @ source_vertex.co - center) * scale
            uv = copy.data.uv_layers.active
            # MAX importer stores V in [-1, 0]; move the whole tile by an integer.
            offset = [-math.floor(min(loop.uv[i] for loop in uv.data) + .001) for i in range(2)]
            for face in copy.data.polygons:
                mat = obj.data.materials[face.material_index]
                x, y = tiles[images[mat.name].name]
                for index in face.loop_indices:
                    old = uv.data[index].uv.copy()
                    old.x += offset[0]
                    old.y += offset[1]
                    if count > 1 and (old.x < -.001 or old.x > 1.001 or old.y < -.001 or old.y > 1.001):
                        raise ValueError('Tiled source UV requires an explicit bake: ' + obj.name)
                    uv.data[index].uv = old if count == 1 else ((x + old.x * 512) / (cols * cell), (y + old.y * 512) / (rows * cell))
            copy.data.materials.clear()
            copy.select_set(True)
            copies.append(copy)
        bpy.context.view_layer.objects.active = copies[0]
        bpy.ops.object.join()
        mesh = 'Assets/Models/' + key + '-warcraft.glb'
        bpy.ops.export_scene.gltf(filepath=str(SAMPLE / mesh), export_format='GLB', use_selection=True, export_materials='NONE', export_animations=False)
        material = 'Assets/Materials/' + key + '-warcraft.mmat'
        (SAMPLE / material).write_text(json.dumps({'version': 8, 'name': key + ' Warcraft archive', 'shader': 'pbr', 'surface': 'cutout', 'alpha_cutoff': .35, 'base_color': [1, 1, 1, 1], 'base_color_texture': texture_path, 'roughness': .88, 'metallic': 0, 'double_sided': True}) + '\n', encoding='utf-8')
        # glTF exports Blender Z-up into the engine's Y-up coordinates.
        size = [(hi.x - lo.x) * scale, (hi.z - lo.z) * scale, (hi.y - lo.y) * scale]
        catalog[key] = {'material': material, 'parts': [{'name': key, 'mesh': mesh, 'pivot': [0, 0, 0]}], 'size': size, 'sourcePack': 'aigei-warcraft-buildings', 'lods': [mesh, mesh]}
        if key in REPLACEMENTS:
            catalog[key].update(factionBuilding=True, maxWorldHeight=5.5 if 'Hall' in key else 4.5)
        mappings[key] = {'objects': names, 'vertices': sum(len(o.data.vertices) for o in source_objects), 'faces': sum(len(o.data.polygons) for o in source_objects), 'textures': [image.name for image in unique], 'animation': 'Static mesh conversion; MAX animation tracks are not imported'}
        for relative in [mesh, texture_path, material]:
            generated.append({'file': relative, 'sha256': sha(SAMPLE / relative)})
        bpy.data.objects.remove(copies[0], do_unlink=True)
        bpy.data.images.remove(atlas)
        print('Exported', key, names, flush=True)
    catalog_path.write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8')
    (SAMPLE / 'aigei-building-sources.json').write_text(json.dumps({'source': {'file': ARCHIVE.relative_to(SAMPLE).as_posix(), 'sha256': ARCHIVE_SHA, 'providedPath': 'G:/work/github/MEgine/tmp/魔兽争霸3warcraft3建筑模型集合_爱给网_aigei_com.zip', 'site': 'https://www.aigei.com/3d/model/', 'license': 'No redistribution grant or CC0 declaration found in archive; user supplied Warcraft scenery'}, 'importer': {'url': IMPORTER_URL, 'sha256': IMPORTER_SHA, 'license': 'GPL-3.0-or-later', 'version': '1.9.2'}, 'sourceMeshCount': len(original), 'sourceMeshes': source_stats, 'replacements': list(REPLACEMENTS), 'models': mappings, 'generated': generated}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Imported', len(REPLACEMENTS), 'building replacements and', len(SCENERY), 'scenery models from', len(original), 'source meshes')


if __name__ == '__main__':
    main()

"""Author: MiYu. Import the original Frozen Throne menu Stand geometry, material states and camera."""
import argparse
import hashlib
import importlib
import json
import pathlib
import struct
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
LIBRARY = ROOT / 'asset-library/warcraft-iii/remaining-ready'
PREFIX = 'Assets/WarcraftUI/MenuBackground/'
CATALOG = 'warcraft-menu-background.json'
TEXTURES = ['base_color_texture', 'normal_texture', 'metallic_roughness_texture', 'occlusion_texture', 'emissive_texture']


def sha(raw): return hashlib.sha256(raw).hexdigest()
def encode(value): return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
def load(path): return json.loads(path.read_bytes())


def source_lighting(raw):
    assert raw[:4] == b'MDLX'
    chunks, offset = {}, 4
    while offset < len(raw):
        tag, size = struct.unpack_from('<4sI', raw, offset); offset += 8
        assert offset + size <= len(raw), 'Truncated source MDX chunk'
        chunks[tag] = raw[offset:offset + size]; offset += size
    pivots = list(struct.iter_unpack('<3f', chunks[b'PIVT']))
    lights, engine, offset = [], [], 0
    data = chunks[b'LITE']
    while offset < len(data):
        size, node_size = struct.unpack_from('<II', data, offset)
        assert offset + size <= len(data) and size == 144 and node_size == 96, 'Expected static source light without transform or light tracks'
        name = data[offset + 8:offset + 88].split(b'\0')[0].decode('ascii')
        object_id, parent_id, flags = struct.unpack_from('<iiI', data, offset + 88)
        assert parent_id == -1 and 0 <= object_id < len(pivots), 'Expected unparented source light'
        light_type = struct.unpack_from('<I', data, offset + 4 + node_size)[0]
        values = struct.unpack_from('<10f', data, offset + 8 + node_size)
        assert light_type == 0, 'Expected omnidirectional source light'
        position = list(pivots[object_id])
        light = dict(name=name, type=light_type, typeName='omnidirectional', objectId=object_id, parentId=parent_id, flags=flags, position=position, attenuationStart=values[0], attenuationEnd=values[1], color=list(values[2:5]), intensity=values[5], ambientColor=list(values[6:9]), ambientIntensity=values[9], evidence=dict(nodeBytes=node_size, lightPayloadBytes=size - 4 - node_size, transformTracks=0, lightTracks=0, staticThroughoutStand=True))
        lights.append(light)
        engine.append(dict(name='Menu background ' + name, sourceObjectId=object_id, components=dict(Transform=dict(position=[position[0] / 128, position[2] / 128, -position[1] / 128], rotation=[0, 0, 0, 1], scale=[1, 1, 1]), PointLight=dict(color=[*light['color'], 1], intensity=light['intensity'], range=light['attenuationEnd'] / 128))))
        offset += size
    assert len(lights) == 5 and all(light['ambientIntensity'] == 0 for light in lights)
    return dict(sourceLights=lights, engineLights=engine, directionalLight=None, environmentLight=None, mapping=dict(position='(x,z,-y)/128; add the background root world translation when lights are not parented to that root', color='Source components copied without adjustment', intensity='Source numeric intensity copied without physical-unit conversion or exposure compensation', range='Source attenuationEnd / 128', attenuationStartSupported=False, engineAttenuation='clamp(1-distance/range,0,1)^2', engineAttenuationEvidence='crates/mengine-rhi/src/renderer.rs::distance_attenuation', equivalentToOriginalLighting=False, sourceAmbient='All five local light ambient intensities are zero. This does not establish the original global environment lighting.', isolation='RawImage render_root filters geometry only; menu lights and battle lights must have separate active states. Global environment and directional lighting are not defined by these five source lights.'), staticEvidence='Each LITE entry has an unparented 96-byte node and 44-byte fixed light payload with no animation tracks; its pivot and light values remain constant throughout Stand.')


def source_bounds(raw):
    vertices, offset = [], 4
    while offset < len(raw):
        tag, size = struct.unpack_from('<4sI', raw, offset); offset += 8
        end = offset + size
        assert end <= len(raw)
        if tag == b'GEOS':
            at = offset
            while at < end:
                inclusive, vertex_tag, count = struct.unpack_from('<I4sI', raw, at)
                assert vertex_tag == b'VRTX' and at + inclusive <= end and 12 + count * 12 <= inclusive
                vertices.extend(struct.iter_unpack('<3f', raw[at + 12:at + 12 + count * 12]))
                at += inclusive
            assert at == end
        offset = end
    assert vertices
    return dict(min=[min(v[i] for v in vertices) for i in range(3)], max=[max(v[i] for v in vertices) for i in range(3)], scope='Raw MDX bind vertices; selected animation poses may move outside these bounds.')


def generate():
    manifest = {r['path']: r for r in load(LIBRARY / 'mengine-build.json')['files']}
    receipt = load(LIBRARY / 'asset-sources.json')
    originals = {r['path'].replace('\\', '/').lower(): r for r in receipt['sourceFiles']}
    files, inputs = {}, {}

    def read(relative):
        raw = (LIBRARY / relative).read_bytes()
        assert relative in manifest and sha(raw) == manifest[relative]['sha256'], 'Modified library input: ' + relative
        inputs[relative] = dict(bytes=len(raw), sha256=sha(raw))
        return raw

    def target(relative):
        assert relative.startswith('Assets/WarcraftIII/'), relative
        return PREFIX + relative.removeprefix('Assets/WarcraftIII/')

    def copy(relative):
        destination = target(relative)
        if destination in files: return destination
        raw = read(relative)
        if relative.endswith('.mmat'):
            material = json.loads(raw)
            for slot in TEXTURES:
                if material.get(slot): material[slot] = copy(material[slot])
            raw = encode(material)
        files[destination] = raw
        importer = {'.glb': 'model', '.png': 'texture', '.mmat': 'material'}.get(pathlib.PurePosixPath(relative).suffix)
        if importer:
            files[destination + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + destination)), importer=importer))
        return destination

    models = json.loads(read('Assets/WarcraftIII/model-catalog.json'))['models']
    model = next(m for m in models if m['source'].replace('\\', '/').lower() == 'ui/glues/mainmenu/mainmenu3d_exp/mainmenu3d_exp.mdx')
    assert len(model['parts']) == 18 and model['clips'][0]['name'] == 'Stand'
    clip = model['clips'][0]
    assert clip['duration'] == 33.333 and clip['frameCount'] == 400 and clip['loop']
    tracks = json.loads(read(model['stateTracks']))['clips'][0]
    assert tracks['name'] == 'Stand' and len(tracks['frames']) == 401
    parts = []
    for original in model['parts']:
        part = dict(original, mesh=copy(original['animatedMesh']), pivot=[0, 0, 0])
        part['animatedMesh'] = part['mesh']
        part['material'] = copy(original['material'])
        for field in ['teamMaterials', 'textureMaterials']:
            part[field] = {k: copy(v) for k, v in original[field].items()}
        runs, previous = [], None
        for index, state in enumerate(tracks['frames']):
            geo = state['geosets'][original['geoset']]
            layer = state['materials'][original['materialIndex']][original['layer']]
            value = [*geo['color'], geo['alpha'] * layer['alpha'], layer['texture']]
            if value != previous:
                runs.append([index, *value]); previous = value
        part['states'] = [runs]
        parts.append(part)
    assert len(parts[2]['textureMaterials']) == 30
    assert parts[14]['mesh'].endswith('geoset-14-animated-uv-0.glb')
    source = originals[model['source'].replace('\\', '/').lower()]
    source_path = 'SourceAssets/' + source['path'].replace('\\', '/')
    raw = read(source_path)
    assert sha(raw) == source['sha256']
    camera = importlib.import_module('import-frost-animated-portrait').convert(raw)
    assert camera['initialSequence'] == 0 and camera['sequences'][0]['name'] == 'Stand'
    # The menu renderer applies its own projection convention to the stored MDX field of view.
    camera['view']['camera3D']['fov_y_degrees'] *= 0.6
    camera['projectionReference'] = dict(fovScale=0.6, scope='Menu background only', source='https://github.com/Retera/WarsmashModEngine/blob/f1bcb4ae54f0ff4a8d5e4bd5892b6a6622441b15/core/src/com/etheller/warsmash/WarsmashGdxMenuScreen.java#L674', originalGameDllVerified=False)
    lighting = source_lighting(raw)
    logo_source = originals['replaceabletextures/worldeditui/warcraftiiiftlogo.blp']
    read('SourceAssets/' + logo_source['path'].replace('\\', '/'))
    logo = copy('Assets/WarcraftIII/Textures/ReplaceableTextures/WorldEditUI/WarcraftIIIFTLogo.png')
    asset = dict(classic=True, realistic=True, classicYaw=0, sourcePack='remaining-ready', sourceModel=model['source'], material=parts[0]['material'], parts=parts, animations=[dict(name=clip['name'], frames=clip['frameCount'], duration=clip['duration'], loop=clip['loop'])])
    imported_models = dict(ClassicWarcraftMenuBackground=asset)
    pages = dict(title='MainMenu Stand', single='SinglePlayer Stand', custom='SinglePlayerSkirmish Stand', options='Options Stand')
    decoration_sources = []
    for side in ['Left', 'Right']:
        source_name = 'UI/Glues/SpriteLayers/Expansion/Top' + side + 'Panel-Expansion.mdx'
        layer_model = next(m for m in models if m['source'].replace('\\', '/').lower() == source_name.lower())
        selected = {page: next(i for i, c in enumerate(layer_model['clips']) if c['name'] == name) for page, name in pages.items()}
        assert selected == dict(title=5, single=11, custom=19, options=57)
        states = json.loads(read(layer_model['stateTracks']))['clips']
        layer_parts = []
        for original in layer_model['parts']:
            part = dict(original, mesh=copy(original['animatedMesh']), pivot=[0, 0, 0])
            part['animatedMesh'] = part['mesh']; part['material'] = copy(original['material'])
            for field in ['teamMaterials', 'textureMaterials']:
                part[field] = {k: copy(v) for k, v in original[field].items()}
            part['states'] = [[] for _ in layer_model['clips']]
            for index in selected.values():
                assert states[index]['name'] == layer_model['clips'][index]['name']
                previous = None
                for frame, state in enumerate(states[index]['frames']):
                    geo = state['geosets'][original['geoset']]
                    material = state['materials'][original['materialIndex']][original['layer']]
                    value = [*geo['color'], geo['alpha'] * material['alpha'], material['texture']]
                    if value != previous:
                        part['states'][index].append([frame, *value]); previous = value
            layer_parts.append(part)
        original_source = originals[source_name.lower()]
        original_raw = read('SourceAssets/' + original_source['path'].replace('\\', '/'))
        assert sha(original_raw) == original_source['sha256']
        decoration_sources.append(original_source)
        imported_models['ClassicWarcraftMenuTop' + side] = dict(classic=True, realistic=True, classicYaw=0, sourcePack='remaining-ready', sourceModel=layer_model['source'], material=layer_parts[0]['material'], parts=layer_parts, animations=[dict(name=c['name'], frames=c['frameCount'], duration=c['duration'], loop=c['loop']) for c in layer_model['clips']], clipsByPage=selected, supportedClips=list(selected.values()), geometry=dict(sourceBindBounds=source_bounds(original_raw), modelRootScale=[128, 128, 128], scaledCoordinates='(sourceX,sourceZ,-sourceY)'))
    decorations = dict(sources=decoration_sources, experimentalProjection=dict(viewport=[960, 720], modelRootScale=[128, 128, 128], camera=dict(position=[0.4, 1000, -0.3], rotation=[-0.7071067811865476, 0, 0, 0.7071067811865476], scale=[1, 1, 1]), camera3D=dict(primary=False, projection='orthographic', orthographic_size=0.3, near=0.1, far=2000), sourceWindow=[0, 0, 0.8, 0.6], originalProjectionVerified=False, scope='Source-coordinate rendering experiment; original game layer projection has not been confirmed by runtime evidence. Stand clips are non-looping and should hold their final frame.'))
    data = dict(schemaVersion=1, author='MiYu', models=imported_models, decorations=decorations, camera=camera, lighting=lighting, logo=dict(texture=logo, source=logo_source, size=[512, 256], scope='Original static logo texture; animated logo presentation has not been validated.'), source=source, sourceUnitsPerModelUnit=128, axes='(x,y,z) -> (x,z,-y)', playback=dict(clip=0, name='Stand', duration=33.333, frames=400, fps=12, loop=True), limitations=dict(sourceLightsImported=True, sourceLightingEquivalent=False, sourceLightCount=5, sourceParticlesImported=False, sourceParticleEmitterCount=33, sourceBillboardsAnnotated=False, sourceBillboardNodes=6, nativeFidelityValidated=False), provenance=dict(library='asset-library/warcraft-iii/remaining-ready', archivePrecedence=receipt['archivePrecedence'], generator='scripts/import-frost-menu-background.py', generatorSha256=sha(pathlib.Path(__file__).read_bytes()), cameraParser='scripts/import-frost-animated-portrait.py', cameraParserSha256=sha((ROOT / 'scripts/import-frost-animated-portrait.py').read_bytes()), inputs=inputs), files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    files[CATALOG] = encode(data)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'samples/frostbound-realms')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args(); output = args.output.resolve(); files = generate()
    previous = output / CATALOG
    old = {r['path']: r['sha256'] for r in load(previous)['files']} if previous.exists() else {}
    for relative, raw in files.items():
        path = output / relative
        if args.check:
            assert path.exists() and path.read_bytes() == raw, 'Generated output differs: ' + relative
        elif path.exists() and relative != CATALOG and path.read_bytes() != raw:
            assert sha(path.read_bytes()) == old.get(relative), 'Preserve modified menu asset: ' + relative
    if not args.check:
        for relative, raw in files.items():
            path = output / relative; path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists() or path.read_bytes() != raw: path.write_bytes(raw)
    print('PASS original menu background: 18 background parts, 136 decoration parts with four source-indexed Stand states, original UV animation/camera, 5 static source light mappings; ' + str(len(files)) + ' outputs; native lighting/particles/billboards and original layer projection remain unvalidated')


if __name__ == '__main__': main()

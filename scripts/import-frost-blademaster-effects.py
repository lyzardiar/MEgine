"""Author: MiYu. Reproduce original Mirror Image geometry and sampled Blademaster body emitters."""
import argparse
import importlib
import json
import pathlib
import struct
import subprocess
import sys
import tempfile
import uuid
from warcraft_mpq import mpyq, read_archive

c = importlib.import_module('convert-warcraft-assets')
nodes = importlib.import_module('convert-frost-classic-billboards')
decode_texture = importlib.import_module('import-frost-blood-mage').decode_texture
ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
PREFIX = 'Assets/OrcHeroes/BlademasterEffects/'
RAW = 'SourceAssets/OrcHeroes/blademaster-effects/'
RECEIPT = 'blademaster-effects-sources.json'
ARCHIVES = ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq']
BINDINGS = [('MirrorImageCaster', 'Abilities/Spells/Orc/MirrorImage/MirrorImageCaster.mdx'), ('MirrorImageMissile', 'Abilities/Spells/Orc/MirrorImage/MirrorImageMissile.mdx'), ('LevelupCaster', 'Abilities/Spells/Other/Levelup/LevelupCaster.mdx'), ('ClassicBladeMasterEmbedded', 'Units/Orc/HeroBladeMaster/HeroBladeMaster.mdx')]
sha, encode = c.sha, nodes.encode


def main(config=None):
    config = config or {}; defaults = globals()
    PREFIX, RAW, RECEIPT, BINDINGS = [config.get(k, defaults[n]) for k, n in [('prefix', 'PREFIX'), ('raw', 'RAW'), ('receipt', 'RECEIPT'), ('bindings', 'BINDINGS')]]
    parser = argparse.ArgumentParser(description=config.get('description', __doc__))
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--source-root', type=pathlib.Path)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--sampler', type=pathlib.Path, default=ROOT / config.get('sampler', 'tmp/warcraft-effects/sentinel-bin/MdxExport.dll'))
    parser.add_argument('--metadata-reader', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    parser.add_argument('--pose-probe', type=pathlib.Path, default=pathlib.Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'))
    args = parser.parse_args(); output = args.output.resolve(); files, sources, archives, casing, dependencies = {}, {}, [], {}, {}
    old = json.loads((output / RECEIPT).read_bytes()) if (output / RECEIPT).exists() else {}
    owned = {r['path']: r for r in old.get('outputs', [])}
    for p, r in owned.items():
        target = output / c.relative(p)
        if not target.is_file() or target.stat().st_size != r['bytes'] or sha(target.read_bytes()) != r['sha256']: raise ValueError('Modified generated output: ' + p)
    signed = {}; dependency_signatures = {}
    if args.source_root:
        dependency_signatures.update({r['path']: r for r in json.loads((args.source_root / RECEIPT).read_bytes()).get('dependencies', [])})
    def load_dependency(path):
        raw = ((args.source_root or output) / c.relative(path)).read_bytes()
        if path in dependency_signatures:
            signature = dependency_signatures[path]
            if len(raw) != signature['bytes'] or sha(raw) != signature['sha256']: raise ValueError('Particle dependency fingerprint mismatch: ' + path)
        dependencies[path] = dict(path=path, bytes=len(raw), sha256=sha(raw))
        return raw

    for receipt_file in config.get('dependencyReceipts', []):
        dependency_receipt = json.loads(load_dependency(receipt_file))
        dependency_signatures.update({r['path']: r for r in dependency_receipt['outputs']})
    particle_models = {}
    for source_path, binding in config.get('particleModels', {}).items():
        catalog_file, model_key = binding
        source_path = source_path.replace('\\', '/').lower(); source_path = source_path[:-4] + '.mdx' if source_path.endswith('.mdl') else source_path
        particle_models[source_path] = json.loads(load_dependency(catalog_file))[model_key]

    def particle_model(path):
        path = path.replace('\\', '/').lower(); path = path[:-4] + '.mdx' if path.endswith('.mdl') else path
        if path not in particle_models: raise ValueError('Unbound original particle model: ' + path)
        model = particle_models[path]; clip = next((i for i, a in enumerate(model['animations']) if a['name'].lower() == 'stand'), None)
        if clip is None: raise ValueError('Particle model has no Stand animation: ' + path)
        animation = model['animations'][clip]; parts = []
        for part in model['lod_parts'][0]:
            load_dependency(part['animatedMesh']); material = json.loads(load_dependency(part['material'])); states = []
            texture = material['base_color_texture']; load_dependency(texture)
            for run in part['states'][clip]:
                state_material = part['textureMaterials'].get(str(int(run[5])), part['material'])
                state_texture = json.loads(load_dependency(state_material))['base_color_texture']; load_dependency(state_texture)
                states.append(dict(frame=run[0], color=run[1:5], texture=state_texture))
            parts.append(dict(mesh=part['animatedMesh'], texture=texture, blend=material['blend_mode'], alphaCutoff=material['alpha_cutoff'] if material['surface'] == 'cutout' else 0, states=states))
        return dict(clip=clip, duration=animation['duration'], fps=12, loop=animation['loop'], parts=parts)
    if args.source_root:
        signed = {r['path'].lower(): r for r in json.loads((args.source_root / RECEIPT).read_bytes())['sources']}
        for r in signed.values():
            raw = (args.source_root / c.relative(r['output'])).read_bytes()
            if len(raw) != r['bytes'] or sha(raw) != r['sha256']: raise ValueError('Source fingerprint mismatch: ' + r['path'])

    def original(path):
        normalized = []
        for part in c.relative(path).parts:
            key = '/'.join([*normalized, part]).lower(); normalized.append(casing.setdefault(key, part))
        path = '/'.join(normalized); key = path.lower()
        if key in sources: return files[sources[key]['output']]
        if args.source_root:
            if key not in signed: raise ValueError('Missing signed source: ' + path)
            r = signed[key]; raw = (args.source_root / c.relative(r['output'])).read_bytes(); archive = r['archive']
        else:
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ARCHIVES)
            for archive, mpq in reversed(archives):
                try: raw = read_archive(mpq, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original source: ' + path)
        target = RAW + 'raw/' + path; files[target] = raw
        sources[key] = dict(path=path, output=target, archive=archive, bytes=len(raw), sha256=sha(raw))
        return raw

    try:
        for _, path in BINDINGS:
            raw = original(path); assert raw[:4] == b'MDLX'; offset = 4
            while offset < len(raw):
                tag, size = struct.unpack_from('<4sI', raw, offset); start = offset + 8; end = start + size; assert end <= len(raw)
                if tag == b'TEXS':
                    assert size % 268 == 0
                    for at in range(start, end, 268):
                        replacement = struct.unpack_from('<I', raw, at)[0]; texture = raw[at + 4:at + 264].split(b'\0', 1)[0].decode('utf-8')
                        dependency = c.REPLACEMENTS.get(replacement, texture)
                        if not dependency: raise ValueError('Unresolved source texture: ' + str(replacement))
                        original(dependency)
                        if replacement in [1, 2]: original(dependency.replace('00.blp', '01.blp'))
                offset = end
            assert offset == len(raw)
    finally:
        for _, archive in archives: archive.file.close()
    tools = ['scripts/import-frost-blademaster-effects.py', 'scripts/convert-warcraft-assets.py', 'scripts/convert-frost-classic-billboards.py', 'scripts/import-frost-blood-mage.py', 'scripts/import-frost-druids.py', 'scripts/warcraft_mpq.py'] + config.get('generators', [])
    binaries = [args.sampler, args.sampler.with_name('Wc3ModelViewer.Core.dll'), args.sampler.with_suffix('.deps.json'), args.sampler.with_suffix('.runtimeconfig.json'), args.metadata_reader, args.metadata_reader.with_name('Wc3ModelViewer.Core.dll'), args.pose_probe]
    pin = ROOT / 'tmp/warcraft-converter' / c.COMMIT
    models, art, bounds_keys, bound_refs, node_report, statistics = {}, {}, [], [], [], {}
    with tempfile.TemporaryDirectory(prefix='blademaster-effects-', dir=ROOT / 'tmp') as temp:
        work = pathlib.Path(temp); export = work / 'export'; geometry = work / 'geometry'
        for r in sources.values():
            target = export / 'raw' / c.relative(r['path']); target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(files[r['output']])
        manifest = dict(source=config.get('source', 'Original Warcraft III Blademaster effects'), archives=[dict(archive=n) for n in ARCHIVES], precedence=ARCHIVES, files=[dict(path=r['path'].replace('/', '\\'), **{k: r[k] for k in ['archive', 'bytes', 'sha256']}) for r in sources.values()], modelSamples=[dict(path=p.replace('/', '\\'), textureSources={}) for key, p in BINDINGS if not key.endswith('Embedded')])
        (export / 'manifest.json').write_bytes(encode(manifest)); prior_sampler, prior_argv = c.sampler, sys.argv
        c.sampler = lambda: (args.sampler, pin / 'upstream/LICENSE', {'upstream.zip': sha((pin / 'upstream.zip').read_bytes())})
        try: sys.argv = ['convert-warcraft-assets', '--input', str(export), '--output', str(geometry)]; c.main()
        finally: c.sampler, sys.argv = prior_sampler, prior_argv
        catalog = {nodes.key(m['source']): m for m in json.loads((geometry / 'Assets/WarcraftIII/model-catalog.json').read_bytes())['models']}
        copied = set()

        def remap(path): return path.replace('Assets/WarcraftIII/', PREFIX)

        def copy(path):
            if path in copied: return
            raw = (geometry / c.relative(path)).read_bytes()
            if path.endswith(('.mmat', '.json')): raw = raw.replace(b'Assets/WarcraftIII/', PREFIX.encode())
            target = remap(path); files[target] = raw; copied.add(path)
            meta = geometry / c.relative(path + '.meta')
            if meta.exists():
                sidecar = json.loads(meta.read_bytes()); sidecar['guid'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + target)); files[target + '.meta'] = encode(sidecar)

        for key, path in BINDINGS:
            sampled = work / (key + '-sampled.json')
            subprocess.run(['dotnet', str(args.sampler), '--effects', str(export / 'raw' / c.relative(path)), str(sampled)], check=True, capture_output=True)
            data = json.loads(sampled.read_bytes()); original_model = data['sourceModel']; textures = original_model['textures']
            for material in data['materials']:
                if material.get('modelPath'):
                    material['model'] = particle_model(material['modelPath']); material['texture'] = ''
                    continue
                identifier = material['textureId']; texture = textures[identifier] if 0 <= identifier < len(textures) else {}; replacement = material['replaceableId'] or texture.get('replaceableId', 0)
                name = c.REPLACEMENTS.get(replacement, texture.get('fileName', '')).replace('\\', '/')
                if not name: raise ValueError('Model-particle emitter requires original model playback: ' + key + ', textureId=' + str(identifier))
                source = sources[name.lower()]
                target = PREFIX + 'Effects/Textures/' + pathlib.PureWindowsPath(source['path']).with_suffix('.png').as_posix()
                raw = files[source['output']]; files[target] = decode_texture(raw) if raw[:4] == b'BLP1' else (geometry / ('Assets/WarcraftIII/Textures/' + pathlib.PureWindowsPath(source['path']).with_suffix('.png').as_posix())).read_bytes(); material['texture'] = target
            effect = PREFIX + 'Effects/' + key + '.mfx'; files[effect] = encode(data)
            files[effect + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + effect)), importer='sampled-effect'))
            animations = [dict(name=a['name'], frames=len(a['frames']), duration=a['duration'], loop=a['loop']) for a in data['clips']]
            frames = [f for a in data['clips'] for f in a['frames']]
            statistics[key] = dict(clips=len(animations), frames=len(frames), particles=sum(len(f['particles']) for f in frames), quads=sum(len(f['quads']) for f in frames), lights=sum(len(f['lights']) for f in frames), sourceParticles=len(original_model['particleEmitters']), sourceRibbons=len(original_model['ribbonEmitters']))
            parts = []
            if not key.endswith('Embedded'):
                model = catalog[path.lower()]; metadata_path = work / (key + '-nodes.json')
                subprocess.run(['dotnet', str(args.metadata_reader), str(export / 'raw' / c.relative(path)), str(metadata_path)], check=True, capture_output=True)
                metadata = json.loads(metadata_path.read_bytes()); files[RAW + 'nodes/' + key + '.json'] = encode(metadata)
                tracks = json.loads((geometry / model['stateTracks']).read_bytes()); copy(model['stateTracks']); annotated = set()
                for part in model['parts']:
                    mesh = part['animatedMesh']
                    if mesh not in annotated:
                        updated, annotations = nodes.annotate((geometry / mesh).read_bytes(), metadata, part['geoset']); (geometry / mesh).write_bytes(updated); annotated.add(mesh); node_report.append(dict(model=key, mesh=remap(mesh), geoset=part['geoset'], billboards=annotations))
                    copy(mesh); copy(part['mesh'])
                    p = dict(part, mesh=remap(mesh), animatedMesh=remap(mesh), material=remap(part['material']), teamMaterials={k: remap(v) for k, v in part['teamMaterials'].items()}, textureMaterials={k: remap(v) for k, v in part['textureMaterials'].items()}, pivot=[0, 0, 0], states=[])
                    for material in {part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()}:
                        mat = json.loads((geometry / material).read_bytes()); copy(material)
                        for slot in ['base_color_texture', 'normal_texture', 'metallic_roughness_texture', 'occlusion_texture', 'emissive_texture']:
                            if mat.get(slot): copy(mat[slot])
                    for clip in tracks['clips']:
                        runs, previous = [], None
                        for frame, state in enumerate(clip['frames']):
                            geo = state['geosets'][part['geoset']]; layer = state['materials'][part['materialIndex']][part['layer']]; value = [*geo['color'], geo['alpha'] * layer['alpha'], layer['texture']]
                            if value != previous: runs.append([frame, *value]); previous = value
                        p['states'].append(runs)
                    parts.append(p)
                assert [a['name'] for a in model['clips']] == [a['name'] for a in animations]
                for ci, clip in enumerate(tracks['clips']):
                    visible = [(fi, [p for p in parts if frame['geosets'][p['geoset']]['alpha'] * frame['materials'][p['materialIndex']][p['layer']]['alpha'] > .001]) for fi, frame in enumerate(clip['frames'])]
                    found = next(((fi, ps) for fi, ps in visible if ps), None)
                    if found: break
                assert found, key
                fi, ps = found
                for p in ps: bound_refs.append(str(geometry / p['mesh'].replace(PREFIX, 'Assets/WarcraftIII/')) + f'#pose={ci}:{fi}'); bounds_keys.append(key)
                models[key] = dict(parts=parts, animations=animations, classic=True, realistic=True, sourceModel=path, material=parts[0]['material'], boundsClip=ci, boundsFrame=fi)
            art[key] = dict(effect=effect, clip=0, parts=parts, animations=animations, sourceModel=path, sourceSha256=sources[path.lower()]['sha256'], embedded=key.endswith('Embedded'))
        boxes = [json.loads(line) for line in subprocess.check_output([str(args.pose_probe), '--stdin'], input=('\n'.join(bound_refs) + '\n').encode()).splitlines()]
        assert len(boxes) == len(bounds_keys)
        for key, model in models.items():
            selected = [b for k, b in zip(bounds_keys, boxes) if k == key]; low = [min(b['min'][i] for b in selected) for i in range(3)]; high = [max(b['max'][i] for b in selected) for i in range(3)]
            model.update(bounds=dict(min=low, max=high), size=[b - a for a, b in zip(low, high)])
        for path, raw in list(files.items()):
            if path.startswith(PREFIX) and path.endswith('.png'): files[path + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + path)), importer='texture'))
        files[config.get('artFile', 'blademaster-effects.json')] = encode(art); files[config.get('modelsFile', 'blademaster-effect-models.json')] = encode(models); files[RAW + 'node-conversion.json'] = encode(node_report)
        files[config.get('licenseFile', 'Assets/Licenses/Blademaster-Effects-W3ModelViewer-MIT.txt')] = (pin / 'upstream/LICENSE').read_bytes()
    for p, raw in files.items():
        target = output / c.relative(p)
        if target.exists() and p not in owned and target.read_bytes() != raw: raise ValueError('Unowned output collision: ' + p)
    receipt = dict(author='MiYu', schemaVersion=1, sources=list(sources.values()), outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())], generatorHashMode='lf-text', generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes().replace(b'\r\n', b'\n'))) for p in tools], binaries=[dict(path=p.relative_to(ROOT).as_posix() if p.is_relative_to(ROOT) else p.as_posix(), bytes=p.stat().st_size, sha256=sha(p.read_bytes())) for p in binaries], upstream=dict(repository=c.UPSTREAM, commit=c.COMMIT, archiveSha256=sha((pin / 'upstream.zip').read_bytes())), statistics=statistics, nativeGeometryParts=len(boxes), runtimeIntegrated=config.get('runtimeIntegrated', True), originalRuntimeVerified=False, limitations=['Sampled viewer particles/ribbons do not prove full original Warcraft solver parity', 'Native parsing and geometry bounds do not prove editor rendering or gameplay'])
    if dependencies: receipt['dependencies'] = [dependencies[p] for p in sorted(dependencies)]
    for p, raw in files.items():
        target = output / c.relative(p); target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    output.mkdir(parents=True, exist_ok=True); (output / RECEIPT).write_bytes(encode(receipt))
    print('PASS ' + config.get('label', 'original Blademaster effects') + ':', len(sources), 'sources,', len(files), 'outputs;', json.dumps(statistics))


if __name__ == '__main__': main()

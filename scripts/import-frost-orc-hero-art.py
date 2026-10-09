"""Author: MiYu. Convert signed original Orc hero bodies and portraits with source node tracks."""
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
portrait = importlib.import_module('import-frost-demon-hunter').portrait
ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha, encode = c.sha, nodes.encode
ARCHIVES = ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq']
BINDINGS = [
    ('Obla', 'ClassicBladeMaster', 'Units/Orc/HeroBladeMaster/HeroBladeMaster'),
    ('Ofar', 'ClassicFarSeer', 'Units/Orc/HeroFarseer/HeroFarSeer'),
    ('Otch', 'ClassicTaurenChieftain', 'Units/Orc/HeroTaurenChieftain/HeroTaurenChieftain'),
    ('Oshd', 'ClassicShadowHunter', 'Units/Orc/HeroShadowHunter/HeroShadowHunter'),
]
RECEIPT = 'orc-hero-art-sources.json'
SOURCE_PREFIX = 'SourceAssets/OrcHeroes/art/'
ASSET_PREFIX = 'Assets/OrcHeroes/'


def owned_outputs(output, receipt_name=RECEIPT):
    receipt = json.loads((output / receipt_name).read_bytes()) if (output / receipt_name).exists() else {}
    signed = {r['path']: r for r in receipt.get('outputs', [])}
    for path, record in signed.items():
        target = output / c.relative(path)
        if not target.is_file() or sha(target.read_bytes()) != record['sha256'] or target.stat().st_size != record['bytes']:
            raise ValueError('Modified generated output: ' + path)
    return {path.lower(): record for path, record in signed.items()}


def main(config=None):
    config = config or {}; defaults = globals()
    BINDINGS, RECEIPT, SOURCE_PREFIX, ASSET_PREFIX = [config.get(k, defaults[n]) for k, n in [('bindings', 'BINDINGS'), ('receipt', 'RECEIPT'), ('raw', 'SOURCE_PREFIX'), ('prefix', 'ASSET_PREFIX')]]
    parser = argparse.ArgumentParser(description=config.get('description', __doc__))
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--source-root', type=pathlib.Path)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--sampler', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/sentinel-bin/MdxExport.dll')
    parser.add_argument('--metadata-reader', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    parser.add_argument('--pose-probe', type=pathlib.Path, default=pathlib.Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'))
    args = parser.parse_args(); output = args.output.resolve(); owned = owned_outputs(output, RECEIPT)
    signed = {}
    if args.source_root:
        prior = json.loads((args.source_root / RECEIPT).read_bytes())
        signed = {r['path'].lower(): r for r in prior['sources']}
        for record in signed.values():
            raw = (args.source_root / c.relative(record['output'])).read_bytes()
            if len(raw) != record['bytes'] or sha(raw) != record['sha256']: raise ValueError('Source fingerprint mismatch: ' + record['path'])
    pin = ROOT / 'tmp/warcraft-converter' / c.COMMIT
    binary_paths = [args.sampler, args.sampler.with_name('Wc3ModelViewer.Core.dll'), args.sampler.with_suffix('.deps.json'), args.sampler.with_suffix('.runtimeconfig.json'), args.metadata_reader, args.metadata_reader.with_name('Wc3ModelViewer.Core.dll'), args.metadata_reader.with_suffix('.deps.json'), args.metadata_reader.with_suffix('.runtimeconfig.json'), args.pose_probe]
    binaries = [dict(path=p.relative_to(ROOT).as_posix() if p.is_relative_to(ROOT) else p.as_posix(), bytes=p.stat().st_size, sha256=sha(p.read_bytes())) for p in binary_paths]
    tools = ['scripts/import-frost-orc-hero-art.py', 'scripts/convert-warcraft-assets.py', 'scripts/convert-frost-classic-billboards.py', 'scripts/import-frost-demon-hunter.py', 'scripts/import-frost-dryad-portrait.py', 'scripts/warcraft_mpq.py'] + config.get('generators', [])
    files, sources, archives, models, views, binding_records, source_case = {}, {}, [], {}, {}, [], {}

    def original(path):
        parts = c.relative(path).parts; normalized = []
        for part in parts:
            candidate = '/'.join([*normalized, part]); normalized.append(source_case.setdefault(candidate.lower(), part))
        path = '/'.join(normalized); key = path.lower()
        if key in sources: return files[sources[key]['output']]
        if args.source_root:
            if key not in signed: raise ValueError('Missing signed source: ' + path)
            record = signed[key]; raw = (args.source_root / c.relative(record['output'])).read_bytes(); archive = record['archive']
        else:
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ARCHIVES)
            for archive, mpq in reversed(archives):
                try: raw = read_archive(mpq, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original source: ' + path)
        target = SOURCE_PREFIX + 'raw/' + path
        files[target] = raw; sources[key] = dict(path=path, output=target, archive=archive, bytes=len(raw), sha256=sha(raw))
        return raw

    try:
        for unit, key, stem in BINDINGS:
            for is_portrait in ([False, True] if config.get('portraits', True) else [False]):
                path = stem + ('_Portrait' if unit == 'Oshd' else '_portrait') + '.mdx' if is_portrait else stem + '.mdx'
                raw = original(path); offset = 4; assert raw[:4] == b'MDLX'
                while offset < len(raw):
                    tag, length = struct.unpack_from('<4sI', raw, offset); start = offset + 8; end = start + length
                    assert end <= len(raw)
                    if tag == b'TEXS':
                        assert length % 268 == 0
                        for item in range(start, end, 268):
                            replacement = struct.unpack_from('<I', raw, item)[0]
                            texture = raw[item + 4:item + 264].split(b'\0', 1)[0].decode('utf-8')
                            dependency = c.REPLACEMENTS.get(replacement, texture)
                            if not dependency: raise ValueError('Unresolved replaceable texture: ' + str(replacement))
                            original(dependency)
                            if replacement in [1, 2]: original(dependency.replace('00.blp', '01.blp'))
                    offset = end
                assert offset == len(raw)
                binding_records.append(dict(unit=unit, key=key + ('Portrait' if is_portrait else ''), path=sources[path.lower()]['path'], portrait=is_portrait))
                if is_portrait:
                    view = portrait(raw)
                    times = {t['kind']: t['keys'][0]['frame'] for t in view['sourceCameraTracks']}
                    view.pop('cameraSampleFrame')
                    views[key + 'Portrait'] = dict(source=path, sourceSha256=sha(raw), framing='fixedSourceFirstKeys', sourceFirstKeyTimes=times, dynamicCameraIntegrated=False, **view)
    finally:
        for _, archive in archives: archive.file.close()
    with tempfile.TemporaryDirectory(prefix='orc-hero-art-', dir=ROOT / 'tmp') as temp:
        work = pathlib.Path(temp); export = work / 'export'; geometry = work / 'geometry'
        for record in sources.values():
            target = export / 'raw' / c.relative(record['path']); target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(files[record['output']])
        manifest = dict(source=config.get('sourceDescription', 'Bundled original Warcraft III Orc hero sources'), archives=[dict(archive=n) for n in ARCHIVES], precedence=ARCHIVES, files=[dict(path=r['path'].replace('/', '\\'), **{k: r[k] for k in ['archive', 'bytes', 'sha256']}) for r in sources.values()], modelSamples=[dict(path=b['path'].replace('/', '\\'), textureSources={}) for b in binding_records])
        (export / 'manifest.json').write_bytes(encode(manifest))
        previous_sampler, previous_argv = c.sampler, sys.argv
        c.sampler = lambda: (args.sampler, pin / 'upstream/LICENSE', {'upstream.zip': sha((pin / 'upstream.zip').read_bytes())})
        try:
            sys.argv = ['convert-warcraft-assets', '--input', str(export), '--output', str(geometry)]; c.main()
        finally: c.sampler, sys.argv = previous_sampler, previous_argv
        catalog = json.loads((geometry / 'Assets/WarcraftIII/model-catalog.json').read_bytes())
        by_path = {nodes.key(m['source']): m for m in catalog['models']}; bound_refs, bounds_keys, node_report = [], [], []
        copied, annotated = set(), set()

        def remap(path): return path.replace('Assets/WarcraftIII/', ASSET_PREFIX)

        def copy(path):
            if path in copied: return
            raw = (geometry / c.relative(path)).read_bytes()
            if path.endswith(('.mmat', '.json')): raw = raw.replace(b'Assets/WarcraftIII/', ASSET_PREFIX.encode())
            files[remap(path)] = raw; copied.add(path)
            meta = geometry / c.relative(path + '.meta')
            if meta.exists():
                sidecar = json.loads(meta.read_bytes()); sidecar['guid'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + remap(path)))
                files[remap(path + '.meta')] = encode(sidecar)

        for binding in binding_records:
            model = by_path[binding['path'].lower()]; metadata_path = work / (binding['key'] + '-nodes.json')
            subprocess.run(['dotnet', str(args.metadata_reader), str(export / 'raw' / c.relative(binding['path'])), str(metadata_path)], check=True, capture_output=True)
            metadata = json.loads(metadata_path.read_bytes()); files[SOURCE_PREFIX + 'nodes/' + binding['key'] + '.json'] = encode(metadata)
            tracks = json.loads((geometry / model['stateTracks']).read_bytes()); copy(model['stateTracks']); parts = []
            for part in model['parts']:
                path = part['animatedMesh']
                if path not in annotated:
                    updated, annotations = nodes.annotate((geometry / path).read_bytes(), metadata, part['geoset'])
                    (geometry / path).write_bytes(updated); annotated.add(path)
                    node_report.append(dict(model=binding['key'], mesh=remap(path), geoset=part['geoset'], billboards=annotations))
                copy(path); copy(part['mesh'])
                p = dict(part, mesh=remap(path), animatedMesh=remap(path), material=remap(part['material']), teamMaterials={k: remap(v) for k, v in part['teamMaterials'].items()}, textureMaterials={k: remap(v) for k, v in part['textureMaterials'].items()}, pivot=[0, 0, 0], states=[])
                for material_path in {part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()}:
                    mat = json.loads((geometry / material_path).read_bytes()); copy(material_path)
                    for slot in ['base_color_texture', 'normal_texture', 'metallic_roughness_texture', 'occlusion_texture', 'emissive_texture']:
                        if mat.get(slot): copy(mat[slot])
                for clip in tracks['clips']:
                    runs, previous = [], None
                    for frame, state in enumerate(clip['frames']):
                        geo = state['geosets'][part['geoset']]; layer = state['materials'][part['materialIndex']][part['layer']]
                        value = [*geo['color'], geo['alpha'] * layer['alpha'], layer['texture']]
                        if value != previous: runs.append([frame, *value]); previous = value
                    p['states'].append(runs)
                parts.append(p)
            visible = []
            for ci, clip in enumerate(tracks['clips']):
                for fi, state in enumerate(clip['frames']):
                    visible = [p for p in parts if state['geosets'][p['geoset']]['alpha'] * state['materials'][p['materialIndex']][p['layer']]['alpha'] > .001]
                    if visible: break
                if visible: break
            assert visible, 'No visible geometry: ' + binding['key']
            for part in visible:
                source_path = part['mesh'].replace(ASSET_PREFIX, 'Assets/WarcraftIII/')
                bound_refs.append(str(geometry / source_path) + f'#pose={ci}:{fi}'); bounds_keys.append(binding['key'])
            models[binding['key']] = dict(unit=binding['unit'], material=parts[0]['material'], parts=parts, boundsSource='nativeFirstVisible', boundsClip=ci, boundsFrame=fi, realistic=True, classic=True, classicTier=1, classicYaw=0, sourcePack='installedClassic', sourceModel=model['source'], sourceStateTracks=remap(model['stateTracks']), animations=[dict(name=clip['name'], frames=clip['frameCount'], duration=clip['duration'], loop=clip['loop']) for clip in model['clips']], lods=[parts[0]['mesh']] * 2, lod_parts=[parts] * 2)
        boxes = [json.loads(line) for line in subprocess.check_output([str(args.pose_probe), '--stdin'], input=('\n'.join(bound_refs) + '\n').encode()).splitlines()]
        assert len(boxes) == len(bounds_keys)
        for key, model in models.items():
            selected = [b for k, b in zip(bounds_keys, boxes) if k == key]
            low = [min(b['min'][i] for b in selected) for i in range(3)]; high = [max(b['max'][i] for b in selected) for i in range(3)]
            model.update(size=[max(.01, high[i] - low[i]) for i in range(3)], bounds=dict(min=low, max=high))
        report = json.loads((geometry / 'Validation/conversion-checks.json').read_bytes())
        files[SOURCE_PREFIX + 'conversion-checks.json'] = encode(report)
        files[SOURCE_PREFIX + 'node-conversion.json'] = encode(dict(models=node_report))
        files[config.get('modelsFile', 'orc-hero-models.json')] = encode(models)
        if config.get('portraits', True): files[config.get('portraitsFile', 'orc-hero-portraits.json')] = encode(views)
        files[config.get('sourceLicenseFile', 'Assets/Licenses/Classic-Orc-Hero-Art.txt')] = ('Original Warcraft III geometry, animation, textures and cameras belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Sources and fingerprints: ' + RECEIPT + '.\n').encode()
        files[config.get('licenseFile', 'Assets/Licenses/Orc-Hero-W3ModelViewer-MIT.txt')] = (pin / 'upstream/LICENSE').read_bytes()
    for path, raw in files.items():
        target = output / c.relative(path)
        if target.exists() and path.lower() not in owned and target.read_bytes() != raw: raise ValueError('Unowned output collision: ' + path)
    receipt = dict(author='MiYu', schemaVersion=1, sources=list(sources.values()), bindings=binding_records, outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())], generatorHashMode='lf-text', generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes().replace(b'\r\n', b'\n'))) for p in tools], binaries=binaries, upstream=dict(repository=c.UPSTREAM, commit=c.COMMIT, archiveSha256=sha((pin / 'upstream.zip').read_bytes())), dependencies=dict(numpy=c.np.__version__, pillow=c.Image.__version__), runtimeIntegrated=False, originalRuntimeVerified=False, limitations=['Fixed portrait framing from original first camera keys; dynamic camera tracks preserved, not played', 'Geometry state and source node tracks preserved; hero particle/ribbon effects require separate conversion', 'Native asset pose bounds do not verify editor rendering or gameplay'])
    for path, raw in files.items():
        target = output / c.relative(path); target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    output.mkdir(parents=True, exist_ok=True); (output / RECEIPT).write_bytes(encode(receipt))
    print('PASS original ' + config.get('race', 'Orc') + ' art:', len(models), 'body/portrait models,', len(sources), 'sources,', len(files), 'signed outputs; batched native bounds:', len(boxes))


if __name__ == '__main__': main()

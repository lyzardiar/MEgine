"""Author: MiYu. Convert source-addressed construction attachments with complete nodes and sampled effects."""
import argparse
import importlib
import json
import pathlib
import subprocess
import tempfile

base = importlib.import_module('convert-frost-classic-billboards')
attachments = importlib.import_module('convert-frost-classic-attachments')
ROOT, LIBRARY = base.ROOT, base.LIBRARY
SOURCES = ['scripts/convert-frost-construction.py', 'scripts/convert-frost-classic-billboards.py', 'scripts/convert-frost-classic-attachments.py', 'scripts/convert-warcraft-effects.py', 'scripts/convert-warcraft-assets.py', 'scripts/warcraft-node-metadata/Program.cs', 'scripts/warcraft-node-metadata/NodeMetadata.csproj', 'scripts/warcraft-attachment-metadata/Program.cs', 'scripts/warcraft-attachment-metadata/AttachmentTracks.cs', 'scripts/warcraft-attachment-metadata/AttachmentMetadata.csproj', 'scripts/warcraft-assets/EffectExport.cs', 'scripts/warcraft-assets/Program.cs', 'scripts/warcraft-assets/MdxExport.csproj']


def source_key(path): return base.key(path).removesuffix('.mdl').removesuffix('.mdx') + '.mdx'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--metadata-reader', type=pathlib.Path, required=True)
    parser.add_argument('--node-reader', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    parser.add_argument('--sampler', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=LIBRARY / 'construction-ready')
    args = parser.parse_args()
    owner = LIBRARY / 'classic-attachment-ready'
    _, owner_sha, receipt = base.load_overlay(owner)
    references = set()
    for metadata in sorted({a['metadata'] for a in receipt['annotations']}):
        references.update(source_key(a['path']) for a in json.loads((owner / metadata).read_bytes())['attachments'] if a['path'])
    library = LIBRARY / 'remaining-ready'
    original_raw = (library / 'asset-sources.json').read_bytes(); original = json.loads(original_raw)
    inputs = {base.key(f['path']): f for f in original['generatedFiles']}
    originals = {source_key(f['path']): f for f in original['sourceFiles']}
    catalog_path = 'Assets/WarcraftIII/model-catalog.json'
    assert base.digest((library / catalog_path).read_bytes()) == inputs[base.key(catalog_path)]['sha256']
    models = {source_key(m['source']): m for m in json.loads((library / catalog_path).read_bytes())['models']}
    assert references and references <= models.keys(), 'Missing embedded construction source'
    generated, catalog, sources = {}, {}, []

    def copy(relative):
        record = inputs[base.key(relative)]; raw = (library / record['path']).read_bytes()
        assert len(raw) == record['bytes'] and base.digest(raw) == record['sha256'], relative
        generated[relative] = raw
        sidecar = inputs.get(base.key(relative + '.meta'))
        if sidecar:
            data = (library / sidecar['path']).read_bytes(); assert base.digest(data) == sidecar['sha256']
            generated[relative + '.meta'] = data
        return raw

    with tempfile.TemporaryDirectory(prefix='construction-conversion-', dir=ROOT / 'tmp') as temporary:
        temporary = pathlib.Path(temporary)
        effect_output = temporary / 'effects'
        command = ['python', str(ROOT / 'scripts/convert-warcraft-effects.py'), '--sampler', str(args.sampler.resolve()), '--output', str(effect_output)]
        for source in sorted(references): command += ['--source', 'remaining-ready/' + source]
        run = subprocess.run(command, capture_output=True, text=True, encoding='utf-8'); assert run.returncode == 0, run.stdout + run.stderr
        effect_receipt = json.loads((effect_output / 'asset-sources.json').read_bytes())
        generated['Licenses/converter-MIT.txt'] = (effect_output / 'Licenses/converter-MIT.txt').read_bytes()
        for f in effect_receipt['generatedFiles']:
            raw = (effect_output / f['path']).read_bytes(); assert base.digest(raw) == f['sha256']
            generated[f['path']] = raw
        effects = {source_key(m['source']): m for m in json.loads((effect_output / 'Assets/WarcraftIII/effect-catalog.json').read_bytes())['models']}
        for source in sorted(references):
            model, original_file = models[source], originals[source]
            raw = (library / 'SourceAssets' / pathlib.PureWindowsPath(original_file['path']).as_posix()).read_bytes()
            assert len(raw) == original_file['bytes'] and base.digest(raw) == original_file['sha256'], source
            generated['SourceAssets/remaining-ready/' + pathlib.PureWindowsPath(original_file['path']).as_posix()] = raw
            target = temporary / 'nodes.json'
            run = subprocess.run(['dotnet', str(args.metadata_reader.resolve()), str(library / 'SourceAssets' / pathlib.PureWindowsPath(original_file['path']).as_posix()), str(target)], capture_output=True, text=True, encoding='utf-8'); assert run.returncode == 0, run.stderr
            definitions = json.loads(target.read_bytes())['attachments']
            run = subprocess.run(['dotnet', str(args.node_reader.resolve()), str(library / 'SourceAssets' / pathlib.PureWindowsPath(original_file['path']).as_posix()), str(target)], capture_output=True, text=True, encoding='utf-8'); assert run.returncode == 0, run.stderr
            metadata = dict(json.loads(target.read_bytes()), attachments=definitions); metadata_raw = base.encode(metadata)
            generated['Nodes/' + base.digest(source.encode())[:16] + '.json'] = metadata_raw
            tracks = json.loads(copy(model['stateTracks'])); parts = []
            for part in model['parts']:
                animated = copy(part['animatedMesh'])
                annotated, _ = base.annotate(animated, metadata, part['geoset'])
                generated[part['animatedMesh']] = attachments.extend(annotated, metadata, metadata['attachments'], part['geoset'])
                p = dict(part, mesh=part['animatedMesh'], pivot=[0, 0, 0]); p['states'] = []
                for clip in tracks['clips']:
                    runs, last = [], None
                    for frame, state in enumerate(clip['frames']):
                        geo = state['geosets'][part['geoset']]; layer = state['materials'][part['materialIndex']][part['layer']]
                        value = [*geo['color'], geo['alpha'] * layer['alpha'], layer['texture']]
                        if value != last: runs.append([frame, *value]); last = value
                    p['states'].append(runs)
                for material_path in {part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()}:
                    material = json.loads(copy(material_path))
                    for slot in ['base_color_texture', 'normal_texture', 'metallic_roughness_texture', 'occlusion_texture', 'emissive_texture']:
                        if material.get(slot): copy(material[slot])
                parts.append(p)
            effect = effects[source]
            assert all(a['name'] == b['name'] and a['duration'] == b['duration'] for a, b in zip(model['clips'], effect['clips']))
            catalog[source] = dict(source=model['source'], parts=parts, animations=[dict(name=c['name'], frames=c['frameCount'], duration=c['duration'], loop=c['loop']) for c in model['clips']], effect=effect['effect'])
            sources.append(dict(original_file, collection='remaining-ready', key=source))
        for name in ['W3ModelViewer-MIT.txt', 'converter-sources.json']:
            generated['Licenses/remaining-ready/' + name] = (library / 'Licenses' / name).read_bytes()
        generated['construction-catalog.json'] = base.encode(dict(models=catalog))
        generated['Licenses/construction-effect-conversion.json'] = (effect_output / 'asset-sources.json').read_bytes()
    output = args.output.resolve(); protected = set(); previous = output / 'asset-sources.json'
    if previous.exists():
        for f in json.loads(previous.read_bytes())['generatedFiles']:
            raw = (output / f['path']).read_bytes()
            assert len(raw) == f['bytes'] and base.digest(raw) == f['sha256'], 'Preserve modified construction output: ' + f['path']
            protected.add(f['path'])
    for relative, raw in generated.items():
        path = output / relative
        assert not path.exists() or path.read_bytes() == raw or relative in protected, 'Preserve untracked construction output: ' + relative
    manifest = dict(generator=SOURCES[0], ownerReceiptSha256=owner_sha, sourceReceiptSha256=base.digest(original_raw), sourceFiles=sources, metadataReaderSha256=base.digest(args.metadata_reader.read_bytes()), nodeReaderSha256=base.digest(args.node_reader.read_bytes()), metadataParserSha256=base.digest(args.metadata_reader.with_name('Wc3ModelViewer.Core.dll').read_bytes()), samplerSha256=base.digest(args.sampler.read_bytes()), samplerCoreSha256=base.digest(args.sampler.with_name('Wc3ModelViewer.Core.dll').read_bytes()), converter={p: base.digest((ROOT / p).read_bytes()) for p in SOURCES}, generatedFiles=[dict(path=p, bytes=len(raw), sha256=base.digest(raw)) for p, raw in sorted(generated.items())], scope='Embedded construction assets resolved by complete MDX path, including distinct SharedModels and Ziggurat UBirth sources. Source geometry and binary preserved, full node tracks added, source material animation and sampled particles/ribbons retained.')
    for relative, raw in generated.items():
        path = output / relative; path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.read_bytes() != raw: path.write_bytes(raw)
    output.mkdir(parents=True, exist_ok=True); previous.write_bytes(base.encode(manifest))
    print('PASS construction conversion:', len(catalog), 'source models,', sum(len(v['parts']) for v in catalog.values()), 'parts,', len(generated), 'files')


if __name__ == '__main__': main()

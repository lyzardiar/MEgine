"""Author: MiYu. Reproduce original Web geometry, node animation, material tracks and sampled particles."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
PREFIX = 'Assets/CryptWeb/'
RECEIPT = 'crypt-web-model-sources.json'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
normalized = lambda value: value.replace('\\', '/').lower()
remap = lambda value: value.replace('Assets/WarcraftIII/', PREFIX)
BINDINGS = [
    dict(key='ClassicCryptWebMissile', source='Webmissile', pack='remaining-ready', model='Abilities/Spells/Undead/Web/Webmissile.mdx', environment=True),
    dict(key='ClassicCryptWebTarget', source='WebTarget', pack='remaining-ready', model='Abilities/Spells/Undead/Web/WebTarget.mdx', environment=True),
    dict(key='ClassicCryptWebAirTarget', source='Web_AirTarget', pack='remaining-ready', model='Abilities/Spells/Undead/Web/Web_AirTarget.mdx', environment=True),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--source-sample', type=Path, default=SAMPLE)
    parser.add_argument('--library', type=Path, default=ROOT / 'asset-library/warcraft-iii')
    parser.add_argument('--pose-probe', type=Path, default=Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'))
    parser.add_argument('--metadata-reader', type=Path, default=ROOT / 'tmp/docs-artifacts/frost-crypt-web/tools/node-metadata/NodeMetadata.dll')
    parser.add_argument('--sampler', type=Path, default=ROOT / 'tmp/docs-artifacts/frost-crypt-web/tools/sampler/MdxExport.dll')
    args = parser.parse_args(); output = args.output.resolve(); source = args.source_sample.resolve()
    previous = json.loads((output / RECEIPT).read_bytes()) if (output / RECEIPT).exists() else {}
    owned = {r['path']: r for r in previous.get('files', [])}
    for path, record in owned.items():
        raw = (output / path).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Preserve edited output: ' + path
    source_receipt_raw = (source / 'crypt-web-sources.json').read_bytes()
    source_receipt = json.loads(source_receipt_raw); original_files = {normalized(r['path']): r for r in source_receipt['sources']}
    catalog_record = next(r for r in source_receipt['files'] if r['path'] == 'crypt-web.json')
    rules_raw = (source / 'crypt-web.json').read_bytes()
    assert sha(rules_raw) == catalog_record['sha256'] and len(rules_raw) == catalog_record['bytes'], 'Modified Web rules'
    rules = json.loads(rules_raw)
    source_models = {normalized(v['path']): v for v in [rules['ability']['missile'], *(b['model'] for b in rules['buffs'].values())]}
    library = args.library.resolve() / 'remaining-ready'
    library_receipt_raw = (library / 'asset-sources.json').read_bytes(); library_receipt = json.loads(library_receipt_raw)
    library_sources = {normalized(r['path']): r for r in library_receipt['sourceFiles']}
    library_files = {normalized(r['path']): r for r in library_receipt['generatedFiles']}
    inputs, originals, files, statistics = {}, {}, {}, {}

    def converted(path):
        record = library_files[normalized(path)]; raw = (library / record['path'].replace('\\', '/')).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Modified source library output: ' + path
        inputs[record['path']] = record
        return raw

    def original(path):
        key = normalized(path); record = original_files[key]; signed = library_sources[key]
        raw = (source / 'SourceAssets/CryptWeb' / record['path']).read_bytes()
        cached = (library / 'SourceAssets' / signed['path'].replace('\\', '/')).read_bytes()
        assert sha(raw) == record['sha256'] == signed['sha256'] == sha(cached) and len(raw) == record['bytes'] == signed['bytes'], 'Original/library mismatch: ' + path
        originals[key] = dict(record, retained='SourceAssets/CryptWeb/' + record['path'], library='remaining-ready/SourceAssets/' + signed['path'].replace('\\', '/'))
        return raw

    library_models = {normalized(m['source']): m for m in json.loads(converted('Assets/WarcraftIII/model-catalog.json'))['models']}
    for binding in BINDINGS:
        key = normalized(binding['model']); original(binding['model'])
        for texture in source_models[key]['textures']: original(texture)
        model = library_models[key]; converted(model['stateTracks'])
        for part in model['parts']:
            for path in [part['mesh'], part['animatedMesh']]:
                converted(path); converted(path + '.meta')
            for path in {part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()}:
                material = json.loads(converted(path)); converted(path + '.meta')
                for slot in ['base_color_texture', 'normal_texture', 'metallic_roughness_texture', 'occlusion_texture', 'emissive_texture']:
                    if material.get(slot): converted(material[slot]); converted(material[slot] + '.meta')

    work_root = ROOT / 'tmp/docs-artifacts/frost-crypt-web'; work_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='model-import-', dir=work_root) as temp:
        work = Path(temp); overlay = work / 'overlay'; geometry = work / 'geometry'; geometry.mkdir()
        (geometry / 'model-catalog.json').write_bytes(encode({})); (geometry / 'classic-sources.json').write_bytes(encode(dict(files=[])))
        bindings = work / 'bindings.json'; bindings.write_bytes(encode(dict(models=BINDINGS)))
        nodes = importlib.import_module('convert-frost-classic-billboards'); nodes.LIBRARY = args.library.resolve()
        classic = importlib.import_module('import-frost-classic'); classic.LIBRARY = nodes.LIBRARY
        old_argv = sys.argv
        try:
            sys.argv = ['convert-frost-classic-billboards.py', '--bindings', str(bindings), '--output', str(overlay), '--metadata-reader', str(args.metadata_reader)]; nodes.main()
            sys.argv = ['import-frost-classic.py', '--output', str(geometry), '--pose-probe', str(args.pose_probe), '--billboard-library', str(overlay), '--bindings', str(bindings), '--keys', *[b['key'] for b in BINDINGS]]; classic.main()
        finally: sys.argv = old_argv
        models = json.loads(remap((geometry / 'model-catalog.json').read_text(encoding='utf-8')))
        geometry_receipt = json.loads((geometry / 'classic-sources.json').read_bytes())
        for record in geometry_receipt['files']:
            path = remap(record['path']); raw = (geometry / record['path']).read_bytes()
            assert sha(raw) == record['sha256'] and len(raw) == record['bytes'], 'Modified generated geometry: ' + path
            if path.endswith('.meta'):
                meta = json.loads(raw); meta['guid'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + path[:-5])); raw = encode(meta)
            elif path.endswith(('.mmat', '.json')): raw = remap(raw.decode('utf-8')).encode('utf-8')
            files[path] = raw
        node_receipt = json.loads((overlay / 'asset-sources.json').read_bytes()); annotations = []
        for binding in BINDINGS:
            key = binding['key']; model = models[key]; source_path = original_files[normalized(binding['model'])]['path']
            node = next(a for a in node_receipt['annotations'] if normalized(a['source']) == normalized(binding['model']))
            metadata_path = PREFIX + 'SourceMetadata/' + key + '-nodes.json'; files[metadata_path] = (overlay / node['metadata']).read_bytes()
            annotations.append(dict(key=key, source=source_path, metadata=metadata_path, parts=[dict(mesh=remap(a['path']), geoset=a['geoset'], nodes=a['nodes']) for a in node_receipt['annotations'] if normalized(a['source']) == normalized(binding['model'])]))
            track_path = library_models[normalized(binding['model'])]['stateTracks']
            files[remap(track_path)] = converted(track_path)
            sampled = work / (key + '.json')
            result = subprocess.run(['dotnet', str(args.sampler), '--effects', str(source / 'SourceAssets/CryptWeb' / source_path), str(sampled)], capture_output=True)
            assert result.returncode == 0, result.stderr.decode('utf-8', errors='replace')
            effect = json.loads(sampled.read_bytes()); textures = effect['sourceModel']['textures']
            decode_texture = importlib.import_module('import-frost-blood-mage').decode_texture
            for material in effect['materials']:
                assert not material.get('modelPath'), 'Unexpected model particle in Web effect'
                texture = textures[material['textureId']]
                assert not material['replaceableId'] and not texture['replaceableId'], 'Unexpected replaceable Web texture'
                record = original_files[normalized(texture['fileName'])]
                path = PREFIX + 'Effects/Textures/' + Path(record['path']).with_suffix('.png').as_posix()
                files[path] = decode_texture(original(record['path'])); material['texture'] = path
                files[path + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + path)), importer='texture'))
            assert [a['name'] for a in model['animations']] == [a['name'] for a in effect['clips']], 'Geometry/particle clip mismatch'
            path = PREFIX + 'Effects/' + key + '.mfx'; files[path] = encode(effect)
            files[path + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + path)), importer='sampled-effect'))
            model.update(effect=path, sourceSha256=original_files[normalized(source_path)]['sha256'], sourceUnitsPerWorldUnit=128)
            frames = [frame for clip in effect['clips'] for frame in clip['frames']]
            statistics[key] = dict(clips=len(effect['clips']), frames=len(frames), particles=sum(len(f['particles']) for f in frames), quads=sum(len(f['quads']) for f in frames), sourceParticles=len(effect['sourceModel']['particleEmitters']), geometryParts=len(model['parts']))
        files['crypt-web-models.json'] = encode(models)
        files[PREFIX + 'Licenses/W3ModelViewer-MIT.txt'] = (library / 'Licenses/W3ModelViewer-MIT.txt').read_bytes()
        files[PREFIX + 'Licenses/Original-Web.txt'] = b'Warcraft III Web models and textures: Blizzard Entertainment original game asset terms apply. W3ModelViewer conversion code is MIT licensed; original game art is not. Signed sources and conversion inputs: crypt-web-model-sources.json and crypt-web-sources.json.\n'
    for path, raw in files.items():
        target = output / path
        assert not target.exists() or target.read_bytes() == raw or path in owned, 'Preserve unsigned output: ' + path
    generators = ['scripts/import-frost-crypt-web-models.py', 'scripts/import-frost-classic.py', 'scripts/convert-frost-classic-billboards.py', 'scripts/import-frost-blood-mage.py', 'scripts/warcraft-node-metadata/Program.cs', 'scripts/warcraft-node-metadata/NodeMetadata.csproj', 'scripts/warcraft-assets/Program.cs', 'scripts/warcraft-assets/EffectExport.cs', 'scripts/warcraft-assets/TextureTracks.cs', 'scripts/warcraft-assets/MdxExport.csproj']
    binaries = [args.pose_probe, args.metadata_reader, args.metadata_reader.with_name('Wc3ModelViewer.Core.dll'), args.sampler, args.sampler.with_name('Wc3ModelViewer.Core.dll')]
    receipt = dict(author='MiYu', sourceReceipt=dict(path='crypt-web-sources.json', sha256=sha(source_receipt_raw)), sources=list(originals.values()), sourceCollection=dict(path='remaining-ready/asset-sources.json', sha256=sha(library_receipt_raw)), conversionInputs=[inputs[p] for p in sorted(inputs)], bindings=BINDINGS, nodeAnnotations=annotations, statistics=statistics, generatorHashMode='lf-text', generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes().replace(b'\r\n', b'\n'))) for p in generators], binaries=[dict(path=p.resolve().relative_to(ROOT).as_posix() if p.resolve().is_relative_to(ROOT) else p.as_posix(), sha256=sha(p.read_bytes()), bytes=p.stat().st_size) for p in binaries], files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())], originalRuntimeVerified=False, limitations=['Native geometry and sampled viewer particles do not prove original Warcraft solver parity or rendered editor acceptance'])
    for path, raw in files.items():
        target = output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    (output / RECEIPT).write_bytes(encode(receipt))
    print('PASS Web models:', len(originals), 'matched originals,', len(files), 'signed outputs;', json.dumps(statistics))


if __name__ == '__main__': main()

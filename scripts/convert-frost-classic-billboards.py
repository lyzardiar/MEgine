"""Author: MiYu. Preserve original node billboards in verified Warcraft actor and scenery geometry."""
import argparse
import hashlib
import json
import pathlib
import struct
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
LIBRARY = ROOT / 'asset-library/warcraft-iii'
SOURCES = ['scripts/convert-frost-classic-billboards.py', 'scripts/warcraft-node-metadata/Program.cs', 'scripts/warcraft-node-metadata/NodeMetadata.csproj']

def digest(raw): return hashlib.sha256(raw).hexdigest()
def encode(value): return (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
def key(path): return pathlib.PureWindowsPath(path).as_posix().lower()

def read_glb(raw):
    assert struct.unpack_from('<III', raw) == (0x46546c67, 2, len(raw)), 'Invalid GLB header'
    size, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4e4f534a, 'Missing GLB JSON'
    binary_size, kind = struct.unpack_from('<II', raw, 20 + size)
    assert kind == 0x004e4942 and 28 + size + binary_size == len(raw), 'Invalid GLB binary'
    return json.loads(raw[20:20 + size]), raw[28 + size:]

def annotate(raw, metadata, geoset):
    doc, binary = read_glb(raw)
    used = next(g['usedNodes'] for g in metadata['geosets'] if g['geoset'] == geoset)
    source_nodes = metadata['nodes']
    assert len(doc['nodes']) == len(used) + 1, 'Unexpected converted node count'
    assert doc['skins'][0]['joints'] == list(range(len(used))), 'Unexpected converted joint order'
    assert doc['nodes'][-1] == dict(mesh=0, skin=0), 'Unexpected mesh node'
    remap = {old: new for new, old in enumerate(used)}
    annotations = []
    for index, old in enumerate(used):
        source = source_nodes[old]; node = doc['nodes'][index]
        assert source['index'] == old and node['name'] == source['name'], 'Source node order changed'
        pivot = source['pivot']; parent = source_nodes[source['parent']]['pivot'] if source['parent'] >= 0 else [0, 0, 0]
        translation = [(pivot[0] - parent[0]) / 128, (pivot[2] - parent[2]) / 128, -(pivot[1] - parent[1]) / 128]
        assert all(abs(a - b) < 1e-6 for a, b in zip(node['translation'], translation)), 'Source node pivot changed'
        assert node.get('children', []) == [remap[j] for j in used if source_nodes[j]['parent'] == old], 'Source node hierarchy changed'
        flags = source['flags'] & 0x78
        existing = node.get('extras', {}).get('mengineBillboard')
        assert existing is None or existing == dict(flags=flags), 'Conflicting node billboard metadata'
        if flags:
            node.setdefault('extras', {})['mengineBillboard'] = dict(flags=flags)
            annotations.append(dict(node=index, sourceNode=old, objectId=source['objectId'], name=source['name'], flags=flags))
    doc.setdefault('extras', {})['mengineMdxAnimation'] = dict(sequences=metadata['sequences'], globalSequences=metadata['globalSequences'], nodes=[dict(node=index, restTranslation=doc['nodes'][index]['translation'], **{field: source_nodes[old][field] for field in ['translation', 'rotation', 'scale']}) for index, old in enumerate(used)])
    text = encode(doc); text += b' ' * (-len(text) % 4)
    output = struct.pack('<III', 0x46546c67, 2, 28 + len(text) + len(binary)) + struct.pack('<II', len(text), 0x4e4f534a) + text + struct.pack('<II', len(binary), 0x004e4942) + binary
    assert read_glb(output)[1] == binary, 'Original binary buffer must remain unchanged'
    return output, annotations

def load_overlay(root):
    receipt_raw = (root / 'asset-sources.json').read_bytes(); receipt = json.loads(receipt_raw)
    for path, expected in receipt['converter'].items(): assert digest((ROOT / path).read_bytes()) == expected, 'Converter changed: ' + path
    for pack, expected in receipt['sourceCollections'].items(): assert digest((LIBRARY / pack / 'asset-sources.json').read_bytes()) == expected, 'Source collection changed: ' + pack
    for record in receipt['sourceFiles']:
        raw = (LIBRARY / record['pack'] / 'SourceAssets' / pathlib.PureWindowsPath(record['path']).as_posix()).read_bytes()
        assert digest(raw) == record['sha256'] and len(raw) == record['bytes'], record['path']
    files = {}
    for record in receipt['generatedFiles']:
        raw = (root / record['path']).read_bytes()
        assert digest(raw) == record['sha256'] and len(raw) == record['bytes'], 'Modified node billboard output: ' + record['path']
        files[record['path']] = raw
    overrides = {}
    for annotation in receipt['annotations']:
        raw = (LIBRARY / annotation['pack'] / annotation['path']).read_bytes()
        assert digest(raw) == annotation['sourceSha256'], annotation['path']
        overrides[(annotation['pack'], key(annotation['path']))] = files[annotation['output']]
    return overrides, digest(receipt_raw), receipt

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--metadata-reader', type=pathlib.Path, required=True)
    parser.add_argument('--bindings', type=pathlib.Path, default=ROOT / 'samples/frostbound-realms/classic-sources.json')
    parser.add_argument('--output', type=pathlib.Path, default=LIBRARY / 'classic-billboard-ready')
    args = parser.parse_args()
    selected = sorted({(m['pack'], m['model']) for m in json.loads(args.bindings.read_bytes())['models']})
    assert selected, 'No classic source bindings'
    generated, sources, annotations, collections = {}, [], [], {}
    models, receipts, files = {}, {}, {}
    for pack in sorted({p for p, _ in selected}):
        root = LIBRARY / pack; raw = (root / 'asset-sources.json').read_bytes()
        receipts[pack] = json.loads(raw); collections[pack] = digest(raw)
        files[pack] = {key(r['path']): r for r in receipts[pack]['generatedFiles']}
        catalog_raw = (root / 'Assets/WarcraftIII/model-catalog.json').read_bytes()
        assert digest(catalog_raw) == files[pack][key('Assets/WarcraftIII/model-catalog.json')]['sha256'], pack
        models[pack] = {key(m['source']): m for m in json.loads(catalog_raw)['models']}
        for name in ['W3ModelViewer-MIT.txt', 'converter-sources.json']:
            generated[f'Licenses/{pack}/{name}'] = (root / 'Licenses' / name).read_bytes()
    with tempfile.TemporaryDirectory(prefix='classic-node-metadata-', dir=ROOT / 'tmp') as temp:
        for pack, source in selected:
            model = models[pack][key(source)]
            original = next(r for r in receipts[pack]['sourceFiles'] if key(r['path']) == key(source))
            path = LIBRARY / pack / 'SourceAssets' / pathlib.PureWindowsPath(original['path']).as_posix()
            raw = path.read_bytes(); assert digest(raw) == original['sha256'] and len(raw) == original['bytes'], source
            sources.append(dict(original, pack=pack))
            target = pathlib.Path(temp) / 'nodes.json'
            run = subprocess.run(['dotnet', str(args.metadata_reader.resolve()), str(path), str(target)], capture_output=True, text=True, encoding='utf-8')
            assert run.returncode == 0, run.stderr
            metadata_raw = target.read_bytes(); metadata = json.loads(metadata_raw)
            metadata_path = f'Nodes/{pack}/' + digest(key(source).encode())[:16] + '.json'
            generated[metadata_path] = metadata_raw
            seen = set()
            for part in model['parts']:
                relative = part['animatedMesh']
                if relative in seen: continue
                seen.add(relative)
                raw = (LIBRARY / pack / relative).read_bytes(); assert digest(raw) == files[pack][key(relative)]['sha256'], relative
                annotated, nodes = annotate(raw, metadata, part['geoset'])
                output = pack + '/' + relative; generated[output] = annotated
                meta = relative + '.meta'; meta_raw = (LIBRARY / pack / meta).read_bytes()
                assert digest(meta_raw) == files[pack][key(meta)]['sha256'], meta
                generated[pack + '/' + meta] = meta_raw
                annotations.append(dict(pack=pack, source=source, metadata=metadata_path, path=relative, output=output, geoset=part['geoset'], sourceSha256=digest(raw), nodes=nodes))
    spelling = {}
    for relative in generated:
        parts = pathlib.PurePosixPath(relative).parts
        for index, part in enumerate(parts):
            prefix = '/'.join(parts[:index + 1]).lower()
            spelling[prefix] = min(part, spelling.get(prefix, part))
    def canonical(relative):
        parts = pathlib.PurePosixPath(relative).parts
        return '/'.join(spelling['/'.join(parts[:index + 1]).lower()] for index in range(len(parts)))
    normalized = {}
    for relative, raw in generated.items():
        path = canonical(relative)
        assert path not in normalized or normalized[path] == raw, 'Conflicting generated path case: ' + path
        normalized[path] = raw
    generated = normalized
    for annotation in annotations:
        annotation['output'] = canonical(annotation['output']); annotation['metadata'] = canonical(annotation['metadata'])
    output = args.output.resolve(); previous = output / 'asset-sources.json'
    protected = {}
    if previous.exists():
        for record in json.loads(previous.read_bytes())['generatedFiles']:
            raw = (output / record['path']).read_bytes()
            assert digest(raw) == record['sha256'] and len(raw) == record['bytes'], 'Preserve modified node billboard output: ' + record['path']
            protected[key(record['path'])] = record['sha256']
    for relative, raw in generated.items():
        path = output / relative
        assert not path.exists() or path.read_bytes() == raw or key(relative) in protected, 'Preserve untracked node billboard output: ' + relative
    receipt = dict(generator='scripts/convert-frost-classic-billboards.py', sourceCollections=collections, metadataReaderSha256=digest(args.metadata_reader.read_bytes()), metadataParserSha256=digest(args.metadata_reader.with_name('Wc3ModelViewer.Core.dll').read_bytes()), converter={p: digest((ROOT / p).read_bytes()) for p in SOURCES}, sourceFiles=sources, annotations=annotations, generatedFiles=[dict(path=p, sha256=digest(raw), bytes=len(raw)) for p, raw in sorted(generated.items())], scope='Original source joint indices, hierarchy and pivots verified. Node billboard flags and original MDX transform tracks added to GLB JSON; existing skin, geometry, UV and sampled animation binary buffers preserved. Originals remain in the source collections.')
    for relative, raw in generated.items():
        path = output / relative; path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.read_bytes() != raw: path.write_bytes(raw)
    output.mkdir(parents=True, exist_ok=True); previous.write_bytes(encode(receipt))
    print('PASS classic node animation:', len(selected), 'source models,', len({(a['pack'], a['source']) for a in annotations if a['nodes']}), 'billboard models,', len(annotations), 'parts,', len(generated), 'files')

if __name__ == '__main__': main()

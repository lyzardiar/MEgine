"""Author: MiYu. Extend verified classic poses with all original nodes and attachment visibility."""
import argparse
import importlib
import json
import pathlib
import struct
import subprocess
import tempfile

base = importlib.import_module('convert-frost-classic-billboards')
ROOT, LIBRARY = base.ROOT, base.LIBRARY
SOURCES = ['scripts/convert-frost-classic-attachments.py', 'scripts/warcraft-attachment-metadata/Program.cs', 'scripts/warcraft-attachment-metadata/AttachmentTracks.cs', 'scripts/warcraft-attachment-metadata/AttachmentTests.cs', 'scripts/warcraft-attachment-metadata/AttachmentMetadata.csproj']

def extend(raw, metadata, attachments, geoset):
    doc, binary = base.read_glb(raw)
    source = metadata['nodes']
    used = next(g['usedNodes'] for g in metadata['geosets'] if g['geoset'] == geoset)
    assert len(doc['nodes']) == len(used) + 1 and doc['nodes'][-1] == dict(mesh=0, skin=0)
    order = used + [n['index'] for n in source if n['index'] not in set(used)]
    remap = {old: new for new, old in enumerate(order)}
    assert set(remap) == set(range(len(source)))
    mesh = doc['nodes'].pop()
    tracks = doc['extras']['mengineMdxAnimation']['nodes']
    definitions = {a['sourceNode']: a for a in attachments}
    assert len(definitions) == len(attachments) and all(source[i]['objectId'] == a['objectId'] for i, a in definitions.items())
    for index, old in enumerate(order):
        node = source[old]; parent = source[node['parent']]['pivot'] if node['parent'] >= 0 else [0, 0, 0]
        p = node['pivot']; translation = [(p[0]-parent[0])/128, (p[2]-parent[2])/128, -(p[1]-parent[1])/128]
        if index >= len(used):
            extra = dict(name=node['name'], translation=translation)
            flags = node['flags'] & 0x78
            if flags: extra['extras'] = dict(mengineBillboard=dict(flags=flags))
            doc['nodes'].append(extra)
            tracks.append(dict(node=index, restTranslation=translation, **{f: node[f] for f in ['translation', 'rotation', 'scale']}))
        else:
            assert all(abs(a-b)<1e-6 for a,b in zip(doc['nodes'][index]['translation'], translation))
        children = [remap[n['index']] for n in source if n['parent'] == old]
        if children: doc['nodes'][index]['children'] = children
        else: doc['nodes'][index].pop('children', None)
        doc['nodes'][index].setdefault('extras', {})['mengineSourceNode'] = dict(index=old, objectId=node['objectId'])
        if old in definitions:
            a = definitions[old]; tracks[index]['attachment'] = {f: a[f] for f in ['id', 'path', 'visibility']}
    doc['nodes'].append(mesh)
    for animation in doc['animations']:
        for channel in animation['channels']:
            if channel['target']['node'] == len(used): channel['target']['node'] = len(order)
    doc['scenes'][doc.get('scene', 0)]['nodes'] = [remap[n['index']] for n in source if n['parent'] < 0] + [len(order)]
    text = base.encode(doc); text += b' ' * (-len(text) % 4)
    output = struct.pack('<III', 0x46546c67, 2, 28+len(text)+len(binary)) + struct.pack('<II', len(text), 0x4e4f534a) + text + struct.pack('<II', len(binary), 0x004e4942) + binary
    assert base.read_glb(output)[1] == binary
    return output

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--metadata-reader', type=pathlib.Path, required=True)
    p.add_argument('--base', type=pathlib.Path, default=LIBRARY/'classic-billboard-ready')
    p.add_argument('--output', type=pathlib.Path, default=LIBRARY/'classic-attachment-ready')
    args = p.parse_args()
    overrides, base_sha, receipt = base.load_overlay(args.base)
    generated, annotations, attachments = {}, [], {}
    with tempfile.TemporaryDirectory(prefix='classic-attachments-', dir=ROOT/'tmp') as temporary:
        for record in receipt['sourceFiles']:
            path = LIBRARY/record['pack']/'SourceAssets'/pathlib.PureWindowsPath(record['path']).as_posix()
            target = pathlib.Path(temporary)/'attachments.json'
            run = subprocess.run(['dotnet', str(args.metadata_reader.resolve()), str(path), str(target)], capture_output=True, text=True, encoding='utf-8')
            assert run.returncode == 0, run.stderr
            attachments[(record['pack'], base.key(record['path']))] = json.loads(target.read_bytes())['attachments']
        for a in receipt['annotations']:
            metadata = json.loads((args.base/a['metadata']).read_bytes())
            definitions = attachments[(a['pack'], base.key(a['source']))]
            generated[a['output']] = extend(overrides[(a['pack'], base.key(a['path']))], metadata, definitions, a['geoset'])
            generated[a['output']+'.meta'] = (args.base/(a['output']+'.meta')).read_bytes()
            generated[a['metadata']] = base.encode(dict(metadata, attachments=definitions))
            annotations.append(dict(a, sourceNodes=len(metadata['nodes']), attachments=len(definitions)))
    for r in receipt['generatedFiles']:
        if r['path'].startswith('Licenses/'): generated[r['path']] = (args.base/r['path']).read_bytes()
    output = args.output.resolve(); previous = output/'asset-sources.json'; protected = set()
    if previous.exists():
        for r in json.loads(previous.read_bytes())['generatedFiles']:
            raw = (output/r['path']).read_bytes()
            assert len(raw) == r['bytes'] and base.digest(raw) == r['sha256'], 'Preserve modified attachment output: '+r['path']
            protected.add(r['path'])
    for relative, raw in generated.items():
        path = output/relative
        assert not path.exists() or path.read_bytes() == raw or relative in protected, 'Preserve untracked attachment output: '+relative
    manifest = dict(generator='scripts/convert-frost-classic-attachments.py', baseCollection=args.base.name, baseReceiptSha256=base_sha, sourceCollections=receipt['sourceCollections'], sourceFiles=receipt['sourceFiles'], annotations=annotations, metadataReaderSha256=base.digest(args.metadata_reader.read_bytes()), metadataParserSha256=base.digest(args.metadata_reader.with_name('Wc3ModelViewer.Core.dll').read_bytes()), converter={s:base.digest((ROOT/s).read_bytes()) for s in SOURCES}, generatedFiles=[dict(path=s, bytes=len(raw), sha256=base.digest(raw)) for s,raw in sorted(generated.items())], scope='Complete source node hierarchy with exact transform and attachment visibility tracks. Skin joint indices, inverse bind matrices, geometry and animation buffers preserved. Attachment visibility describes authored embedded attachments, independently of external spell anchors.')
    for relative, raw in generated.items():
        path = output/relative; path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.read_bytes() != raw: path.write_bytes(raw)
    output.mkdir(parents=True, exist_ok=True); previous.write_bytes(base.encode(manifest))
    definitions = [a for values in attachments.values() for a in values]
    print('PASS classic attachments:', json.dumps(dict(models=len(attachments), parts=len(annotations), attachmentNodes=len(definitions), visibilityTracks=sum(a['visibility'] is not None for a in definitions), embeddedPaths=sum(bool(a['path']) for a in definitions), files=len(generated))))

if __name__ == '__main__': main()

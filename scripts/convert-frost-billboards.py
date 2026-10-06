"""Author: MiYu. Preserve MDX billboard nodes in selected verified Warcraft spell geometry."""
import argparse
import hashlib
import json
import pathlib
import struct
import subprocess
import tempfile
import importlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
converter = importlib.import_module('convert-warcraft-assets')
NAMES = ['BloodLustTarget', 'BloodLustSpecial', 'LightningShieldTarget', 'LightningShieldBuff', 'MassTeleportCaster', 'MassTeleportTarget', 'MassTeleportTo']
def encode(value): return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
def digest(raw): return hashlib.sha256(raw).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sampler', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'asset-library/warcraft-iii/billboard-ready')
    args = parser.parse_args()
    source = ROOT / 'asset-library/warcraft-iii/remaining-ready'
    receipt_raw = (source / 'asset-sources.json').read_bytes()
    receipt = json.loads(receipt_raw)
    files = {r['path']: r for r in receipt['generatedFiles']}
    models = {m['id']: m for m in json.loads((source / 'Assets/WarcraftIII/model-catalog.json').read_bytes())['models']}
    generated, sources, annotations = {}, [], []
    def copy(relative):
        raw = (source / relative).read_bytes()
        assert digest(raw) == files[relative]['sha256'], relative
        generated[relative] = raw
        if relative + '.meta' in files: copy_meta = relative + '.meta'; generated[copy_meta] = (source / copy_meta).read_bytes(); assert digest(generated[copy_meta]) == files[copy_meta]['sha256'], copy_meta
        return raw
    with tempfile.TemporaryDirectory(prefix='billboard-source-', dir=ROOT / 'tmp') as temp:
        for name in NAMES:
            model = models[name]
            original = next(r for r in receipt['sourceFiles'] if r['path'].replace('\\', '/').lower() == model['source'].replace('\\', '/').lower())
            raw = (source / 'SourceAssets' / original['path']).read_bytes()
            assert digest(raw) == original['sha256'], name
            generated['SourceAssets/' + original['path']] = raw; sources.append(original)
            sampled = pathlib.Path(temp) / (name + '.json')
            subprocess.run(['dotnet', str(args.sampler.resolve()), str((source / 'SourceAssets' / original['path']).resolve()), str(sampled)], check=True, capture_output=True)
            data = json.loads(sampled.read_bytes()); nodes = data['model']['nodes']
            by_name = {n['name']: n for n in nodes}; assert len(by_name) == len(nodes), name
            copy(model['stateTracks']); copy(model['prefab'])
            for part in model['parts']:
                copy(part['mesh'])
                path = part['animatedMesh']
                if path not in generated:
                    raw = copy(path)
                    size, kind = struct.unpack_from('<II', raw, 12); assert kind == 0x4e4f534a
                    doc = json.loads(raw[20:20 + size]); binary_size, binary_kind = struct.unpack_from('<II', raw, 20 + size); assert binary_kind == 0x004e4942
                    annotated = []
                    for node in doc['nodes']:
                        if 'name' not in node: continue
                        flags = by_name[node['name']]['flags'] & 0x78
                        if flags:
                            node.setdefault('extras', {})['mengineBillboard'] = dict(flags=flags); annotated.append(dict(node=node['name'], flags=flags))
                    if annotated:
                        glb = converter.Glb(); glb.doc = doc; glb.blob = bytearray(raw[28 + size:28 + size + binary_size])
                        target = pathlib.Path(temp) / 'annotated.glb'; glb.save(target); generated[path] = target.read_bytes()
                    annotations.append(dict(path=path, sourceSha256=files[path]['sha256'], nodes=annotated))
                for material_path in {part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()}:
                    material = json.loads(copy(material_path))
                    for slot in ['base_color_texture', 'normal_texture', 'metallic_roughness_texture', 'occlusion_texture', 'emissive_texture']:
                        if material.get(slot): copy(material[slot])
    generated['Assets/WarcraftIII/model-catalog.json'] = encode(dict(schemaVersion=1, models=[models[n] for n in NAMES]))
    generated['Licenses/converter-MIT.txt'] = (source / 'Licenses/W3ModelViewer-MIT.txt').read_bytes()
    generated['Licenses/geometry-converter-sources.json'] = (source / 'Licenses/converter-sources.json').read_bytes()
    upstream = json.loads(generated['Licenses/geometry-converter-sources.json'])
    output = args.output.resolve(); previous = output / 'asset-sources.json'
    if previous.exists():
        old = json.loads(previous.read_bytes())
        for record in old['generatedFiles']:
            assert digest((output / record['path']).read_bytes()) == record['sha256'], 'Preserve modified billboard output: ' + record['path']
    manifest = dict(sourceCollection='remaining-ready', sourceReceiptSha256=digest(receipt_raw), samplerSha256=digest(args.sampler.read_bytes()), converter={p: digest((ROOT / p).read_bytes()) for p in ['scripts/convert-frost-billboards.py', 'scripts/convert-warcraft-assets.py']}, sourceFiles=sources, annotations=annotations, generatedFiles=[dict(path=p, sha256=digest(raw), bytes=len(raw)) for p, raw in sorted(generated.items())], upstream=dict(url=upstream['repository'],commit=upstream['commit'],archiveSha256=upstream['files']['upstream.zip']), scope='Source billboard flags preserved as node extras; original verified animation and skin binary buffers retained.')
    for relative, raw in generated.items():
        path = output / relative; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(raw)
    previous.write_bytes(encode(manifest))
    print('PASS billboard metadata:', len(NAMES), 'models,', sum(len(a['nodes']) for a in annotations), 'node annotations,', len(generated), 'files')

if __name__ == '__main__': main()

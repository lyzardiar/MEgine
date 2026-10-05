"""Author: MiYu. Import original sampled effects and animated model attachment positions."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
LIBRARY = ROOT / 'asset-library/warcraft-iii'
NAMES = ['HealingSalveTarget', 'Scroll_Regen_Target', 'ClarityTarget', 'Staff_Sanctuary_Target', 'RejuvenationTarget', 'CrippleTarget']
NAMES += [prefix + size + 'BuildingFire' + str(i) for prefix in ['', 'Elf', 'Undead'] for size in ['Small', 'Large'] for i in range(3)]

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def encode(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sampler', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    args = parser.parse_args()
    output = args.output.resolve()
    library = LIBRARY / 'effects-ready'
    effects = json.loads((library / 'Assets/WarcraftIII/effect-catalog.json').read_text())['models']
    receipt = json.loads((library / 'asset-sources.json').read_text())
    originals = {f['path'].lower(): f for f in receipt['sourceFiles']}
    generated, catalog, sources, attachments, textures = {}, {}, [], {}, {}
    for name in NAMES:
        matches = [m for m in effects if pathlib.PureWindowsPath(m['source']).stem == name and m['collection'] == 'remaining-ready']
        assert len(matches) == 1, (name, len(matches))
        model = matches[0]
        raw = (library / model['effect']).read_bytes()
        data = json.loads(raw)
        generated[model['effect']] = raw
        for material in data['materials']:
            texture = material['texture']
            generated[texture] = (library / texture).read_bytes()
            textures[texture] = receipt['textureSources'][texture]
            assert digest(generated[texture]) == textures[texture]['convertedSha256'], texture
        stand = next(i for i, clip in enumerate(model['clips']) if clip['name'].lower() == 'stand')
        catalog[name] = dict(effect=model['effect'], clip=stand, duration=model['clips'][stand]['duration'])
        source_path = model['collection'] + '/' + model['source'].replace('\\', '/')
        original = originals[source_path.lower()]
        assert digest((library / 'SourceAssets' / source_path).read_bytes()) == original['sha256'], source_path
        sources.append(dict(source=model['source'], sourceSha256=original['sha256'], collection=model['collection'], effect=model['effect'], sha256=digest(raw)))
    art = json.loads((SAMPLE / 'model-catalog.json').read_text())
    models = {pack: {m['source'].lower(): m for m in json.loads((LIBRARY / pack / 'Assets/WarcraftIII/model-catalog.json').read_text())['models']} for pack in ['game-ready', 'remaining-ready']}
    cache = {}
    with tempfile.TemporaryDirectory(prefix='frost-anchors-') as temp:
        for key, asset in art.items():
            if not asset.get('classic'):
                continue
            pack, identifier = asset['sourcePack'], asset['sourceModel']
            pair = (pack, identifier)
            if pair not in cache:
                model = models[pack][identifier.lower()]
                source = LIBRARY / pack / 'SourceAssets' / pathlib.Path(*pathlib.PureWindowsPath(model['source']).parts)
                # Original exports preserve file casing from the source MPQ.
                if not source.exists():
                    source = next(p for p in (LIBRARY / pack / 'SourceAssets').rglob(source.name) if str(p).lower().endswith(str(pathlib.Path(*pathlib.PureWindowsPath(model['source']).parts)).lower()))
                target = pathlib.Path(temp) / 'anchors.json'
                subprocess.run(['dotnet', str(args.sampler.resolve()), '--attachments', str(source), str(target)], check=True, capture_output=True)
                raw_tracks = json.loads(target.read_text())
                assert len(raw_tracks['clips']) == len(asset['animations']), key
                assert all(a['name'] == b['name'] and abs(a['duration'] - b['duration']) < 1e-6 for a, b in zip(raw_tracks['clips'], asset['animations'])), key
                nodes = [i for i, name in enumerate(raw_tracks['names']) if name.strip().lower() in ['origin ref', 'sprite first ref', 'sprite second ref', 'sprite third ref', 'sprite large ref']]
                clips = []
                for clip in raw_tracks['clips']:
                    runs, previous_frame = [], None
                    for frame, positions in enumerate(clip['frames']):
                        values = [positions[i] for i in nodes]
                        if values != previous_frame:
                            runs.append([frame, values])
                            previous_frame = values
                    clips.append(dict(name=clip['name'], duration=clip['duration'], frames=len(clip['frames']), runs=runs))
                data = dict(fps=raw_tracks['fps'], names=[raw_tracks['names'][i] for i in nodes], clips=clips, source=model['source'], sourceSha256=digest(source.read_bytes()))
                cache[pair] = data
            attachments[key] = pack + '/' + identifier
    generated['effect-catalog.json'] = encode(dict(schemaVersion=1, effects=catalog, attachments=attachments, models={pack + '/' + identifier: data for (pack, identifier), data in cache.items()}))
    generated['Licenses/Warcraft-model-viewer-MIT.txt'] = (library / 'Licenses/converter-MIT.txt').read_bytes()
    generated['Licenses/WarcraftIII-Effects.txt'] = b'Author: MiYu\nWarcraft III source models and textures: Blizzard Entertainment. Original asset rights remain with their owners.\nThe W3ModelViewer conversion tool is MIT licensed; its license is preserved separately.\neffect-sources.json records original model/texture hashes, converted output hashes and the pinned tool source.\n'
    manifest_path = output / 'effect-sources.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    hashes = {f['path']: f['sha256'] for f in old.get('files', [])}
    for relative, raw in generated.items():
        destination = output / relative
        if destination.exists() and destination.read_bytes() != raw:
            assert hashes.get(relative) == digest(destination.read_bytes()), f'Preserve modified effect output: {destination}'
    for relative, raw in generated.items():
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() or destination.read_bytes() != raw:
            destination.write_bytes(raw)
    manifest = dict(samplerSha256=digest(args.sampler.read_bytes()), upstream=receipt['upstream'], sources=sources, textureSources=textures, attachmentModels=len(cache), files=[dict(path=p, sha256=digest(raw), bytes=len(raw)) for p, raw in sorted(generated.items())])
    manifest_path.write_bytes(encode(manifest))
    print(f'PASS imported {len(catalog)} original effects, {len(cache)} model attachment tracks, {len(generated)} protected files')

if __name__ == '__main__':
    main()

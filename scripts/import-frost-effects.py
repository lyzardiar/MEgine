"""Author: MiYu. Import original sampled effects and animated model attachment positions."""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import tempfile
from warcraft_mpq import mpyq, read_archive

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
LIBRARY = ROOT / 'asset-library/warcraft-iii'
NAMES = ['HealingSalveTarget', 'Scroll_Regen_Target', 'ClarityTarget', 'Staff_Sanctuary_Target', 'RejuvenationTarget', 'CrippleTarget']
NAMES += [prefix + size + 'BuildingFire' + str(i) for prefix in ['', 'Elf', 'Undead'] for size in ['Small', 'Large'] for i in range(3)]
SPELL_NAMES = ['BloodLustTarget', 'BloodLustSpecial', 'LightningShieldTarget', 'LightningShieldBuff', 'MassTeleportCaster', 'MassTeleportTarget', 'MassTeleportTo']

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def encode(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sampler', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path(r'E:\Program Files (x86)\dzclient\Game\Warcraft III Frozen Throne'))
    args = parser.parse_args()
    output = args.output.resolve()
    generated, catalog, sources, attachments, textures = {}, {}, [], {}, {}
    geometry = LIBRARY / 'remaining-ready'
    geometry_catalog = {m['id'].lower(): m for m in json.loads((geometry / 'Assets/WarcraftIII/model-catalog.json').read_text())['models']}
    geometry_receipt = json.loads((geometry / 'asset-sources.json').read_text())
    geometry_files = {f['path'].lower(): f for f in geometry_receipt['generatedFiles']}
    def geometry_copy(relative):
        raw = (geometry / relative).read_bytes()
        assert digest(raw) == geometry_files[relative.lower()]['sha256'], relative
        generated[relative] = raw
        meta = relative + '.meta'
        if meta.lower() in geometry_files:
            generated[meta] = (geometry / meta).read_bytes()
            assert digest(generated[meta]) == geometry_files[meta.lower()]['sha256'], meta
        return raw
    for name in NAMES + SPELL_NAMES:
        library = LIBRARY / ('spell-effects-ready' if name in SPELL_NAMES else 'effects-ready')
        effects = json.loads((library / 'Assets/WarcraftIII/effect-catalog.json').read_text())['models']
        receipt_raw = (library / 'asset-sources.json').read_bytes()
        receipt = json.loads(receipt_raw)
        originals = {f['path'].lower(): f for f in receipt['sourceFiles']}
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
        stand = next((i for i, clip in enumerate(model['clips']) if clip['name'].lower() == 'stand'), 0)
        catalog[name] = dict(effect=model['effect'], clip=stand, duration=model['clips'][stand]['duration'])
        if name in SPELL_NAMES:
            geo = geometry_catalog[name.lower()]
            assert geo['source'].lower() == model['source'].lower() and len(geo['clips']) == len(model['clips']), name
            tracks = json.loads(geometry_copy(geo['stateTracks']))
            parts = []
            for part in geo['parts']:
                p = dict(part, mesh=part['animatedMesh'], pivot=[0, 0, 0])
                geometry_copy(p['mesh'])
                for material_path in {part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()}:
                    material = json.loads(geometry_copy(material_path))
                    for slot in ['base_color_texture', 'normal_texture', 'metallic_roughness_texture', 'occlusion_texture', 'emissive_texture']:
                        if material.get(slot): geometry_copy(material[slot])
                p['states'] = []
                for clip in tracks['clips']:
                    runs, last = [], None
                    for frame, state in enumerate(clip['frames']):
                        geoset = state['geosets'][part['geoset']]
                        layer = state['materials'][part['materialIndex']][part['layer']]
                        value = [*geoset['color'], geoset['alpha'] * layer['alpha'], layer['texture']]
                        if value != last: runs.append([frame, *value]); last = value
                    p['states'].append(runs)
                parts.append(p)
            catalog[name].update(parts=parts, animations=[dict(name=c['name'], frames=c['frameCount'], duration=c['duration'], loop=c['loop']) for c in geo['clips']])
            assert all(a['name'] == b['name'] and abs(a['duration'] - b['duration']) < 1e-6 for a, b in zip(geo['clips'], model['clips'])), name
        source_path = model['collection'] + '/' + model['source'].replace('\\', '/')
        original = originals[source_path.lower()]
        assert digest((library / 'SourceAssets' / source_path).read_bytes()) == original['sha256'], source_path
        sources.append(dict(source=model['source'], sourceSha256=original['sha256'], collection=model['collection'], effect=model['effect'], sha256=digest(raw), conversionReceiptSha256=digest(receipt_raw)))
    art_definitions = []
    archives = [(n, mpyq.MPQArchive(str(args.game / n))) for n in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq']]
    for relative, ids in [('Units/OrcAbilityFunc.txt', ['Bblo', 'Blsh']), ('Units/ItemAbilityFunc.txt', ['AItp'])]:
        for archive_name, archive in reversed(archives):
            try: raw = read_archive(archive, relative.replace('/', '\\')); break
            except FileNotFoundError: continue
        else: raise ValueError(f'Missing original ability art: {relative}')
        generated['SourceAssets/AbilityArt/' + relative] = raw
        sections = {}
        for match in re.finditer(r'^\[([^\]]+)\]\s*\n(.*?)(?=^\[|\Z)', raw.decode('utf-8', errors='replace'), re.M | re.S):
            if match[1] in ids:
                sections[match[1]] = dict(line.split('=', 1) for line in match[2].splitlines() if '=' in line and not line.startswith('//'))
        assert set(sections) == set(ids), relative
        art_definitions.append(dict(source=relative, archive=archive_name, sha256=digest(raw), sections=sections))
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
                nodes = [i for i, name in enumerate(raw_tracks['names']) if name.strip().lower() in ['origin ref', 'hand left ref', 'hand right ref', 'sprite first ref', 'sprite second ref', 'sprite third ref', 'sprite large ref']]
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
    generated['effect-catalog.json'] = encode(dict(schemaVersion=1, effects=catalog, attachments=attachments, models={pack + '/' + identifier: data for (pack, identifier), data in cache.items()}, artDefinitions=art_definitions))
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
    manifest = dict(samplerSha256=digest(args.sampler.read_bytes()), importerSha256=digest(pathlib.Path(__file__).read_bytes()), upstream=receipt['upstream'], sources=sources, textureSources=textures, artDefinitions=art_definitions, attachmentModels=len(cache), files=[dict(path=p, sha256=digest(raw), bytes=len(raw)) for p, raw in sorted(generated.items())])
    manifest_path.write_bytes(encode(manifest))
    print(f'PASS imported {len(catalog)} original effects, {len(cache)} model attachment tracks, {len(generated)} protected files')

if __name__ == '__main__':
    main()

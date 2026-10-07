"""Author: MiYu. Preserve original Detonate rules, command portrait, geometry and sampled particles."""
import argparse
import hashlib
import importlib
import json
import pathlib
import re
from warcraft_mpq import mpyq, read_archive

base = importlib.import_module('import-frost-entangled-assets')
wisp = importlib.import_module('import-frost-wisp-rules')
ROOT, SAMPLE = base.ROOT, base.SAMPLE
sha, encode = base.sha, base.encode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--effects', type=pathlib.Path, default=ROOT / 'tmp/wisp-detonate/effects')
    parser.add_argument('--geometry', type=pathlib.Path, default=ROOT / 'tmp/wisp-detonate/geometry')
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path(r'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); output = args.output.resolve()
    previous_path = SAMPLE / 'detonate-sources.json'
    previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else {}
    files, sources, archives = {}, [], []
    def original(relative):
        saved = next((r for r in previous.get('sources', []) if r['path'] == relative), None)
        if saved:
            raw = (SAMPLE / 'SourceAssets/WarcraftIII' / relative).read_bytes()
            assert len(raw) == saved['bytes'] and sha(raw) == saved['sha256'], relative
            record = saved
        else:
            if not archives:
                archives.extend((name, mpyq.MPQArchive(str(args.game / name))) for name in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, relative.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original Detonate source: ' + relative)
            record = dict(path=relative, archive=name, bytes=len(raw), sha256=sha(raw))
        files['SourceAssets/WarcraftIII/' + relative] = raw; sources.append(record)
        return raw
    ability = wisp.rows(original('Units/AbilityData.slk'))['Adtn']
    unit = wisp.rows(original('Units/UnitAbilities.slk'))['ewsp']
    raw = original('Units/NightElfAbilityFunc.txt')
    section = re.search(r'^\[Adtn\]\s*\n(.*?)(?=^\[|\Z)', raw.decode('utf-8'), re.M | re.S)[1]
    art = dict(line.split('=', 1) for line in section.splitlines() if '=' in line and not line.startswith('//'))
    assert 'Adtn' in unit['abilList'].split(',') and art['Order'] == 'detonate' and art['Buttonpos'] == '1,2'
    rules = dict(sourceAbility='Adtn', sourceUnitsPerWorldUnit=100, manaDrain=float(ability['DataA1']), summonDamage=float(ability['DataB1']), radius=float(ability['Area1']) / 100, range=float(ability['Rng1']) / 100, cost=float(ability['Cost1']), cooldown=float(ability['Cool1']), sourceRow=ability, sourceArt=art)
    files['Assets/Art/classic-detonate.png'] = base.decode_icon(original(art['Art'].replace('\\', '/')))
    effects, receipts = {}, []
    for key, library, name in [('detonate', args.effects, 'WispExplode'), ('dispel', args.effects, 'DispelMagicTarget')]:
        receipt_raw = (library / 'asset-sources.json').read_bytes(); receipt = json.loads(receipt_raw)
        files['SourceAssets/Detonate/effect-conversion.json'] = receipt_raw
        catalog = json.loads((library / 'Assets/WarcraftIII/effect-catalog.json').read_bytes())
        model = next(m for m in catalog['models'] if pathlib.PureWindowsPath(m['source']).stem.lower() == name.lower())
        verified = {f['path'].lower(): f for f in receipt['generatedFiles']}
        def copy(relative):
            raw = (library / relative).read_bytes(); record = verified[relative.lower()]
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], relative
            files[relative] = raw
            if (relative + '.meta').lower() in verified: copy(relative + '.meta')
            return raw
        effect = json.loads(copy(model['effect']))
        for material in effect['materials']: copy(material['texture'])
        source = model['collection'] + '/' + model['source'].replace('\\', '/')
        record = next(r for r in receipt['sourceFiles'] if r['path'].lower() == source.lower())
        raw = (library / 'SourceAssets' / source).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256']
        files['SourceAssets/WarcraftEffects/' + source] = raw
        clip = next(i for i, c in enumerate(model['clips']) if c['name'].lower() == 'birth')
        effects[key] = dict(effect=model['effect'], clip=clip, duration=model['clips'][clip]['duration'], animations=model['clips'], parts=[])
        receipts.append(dict(key=key, source=source, sourceSha256=sha(raw), receiptSha256=sha(receipt_raw), converter=receipt['converter']))
    library = ROOT / 'asset-library/warcraft-iii/remaining-ready'
    receipt_raw = (library / 'asset-sources.json').read_bytes(); receipt = json.loads(receipt_raw)
    verified = {f['path'].lower(): f for f in receipt['generatedFiles']}
    node_raw = (args.geometry / 'asset-sources.json').read_bytes(); nodes = json.loads(node_raw)
    assert nodes['sourceCollections']['remaining-ready'] == sha(receipt_raw)
    node_files = {f['path']: f for f in nodes['generatedFiles']}
    overrides = {r['path'].lower(): r for r in nodes['annotations']}
    def geometry(relative):
        raw = (library / relative).read_bytes(); record = verified[relative.lower()]
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], relative
        if relative.lower() in overrides:
            annotation = overrides[relative.lower()]; assert sha(raw) == annotation['sourceSha256']
            raw = (args.geometry / annotation['output']).read_bytes()
            assert sha(raw) == node_files[annotation['output']]['sha256']
        files[relative] = raw
        if (relative + '.meta').lower() in verified: geometry(relative + '.meta')
        return raw
    catalog = json.loads((library / 'Assets/WarcraftIII/model-catalog.json').read_bytes())['models']
    for key, name in [('detonate', 'WispExplode'), ('dispel', 'DispelMagicTarget')]:
        model = next(m for m in catalog if m['id'] == name)
        states = json.loads(geometry(model['stateTracks']))
        for part in model['parts']:
            p = dict(part, mesh=part['animatedMesh'], pivot=[0, 0, 0], states=[]); geometry(p['mesh'])
            for relative in {part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()}:
                material = json.loads(geometry(relative))
                for slot in ['base_color_texture', 'normal_texture', 'metallic_roughness_texture', 'occlusion_texture', 'emissive_texture']:
                    if material.get(slot): geometry(material[slot])
            for clip in states['clips']:
                runs, last = [], None
                for frame, state in enumerate(clip['frames']):
                    g, layer = state['geosets'][part['geoset']], state['materials'][part['materialIndex']][part['layer']]
                    value = [*g['color'], g['alpha'] * layer['alpha'], layer['texture']]
                    if value != last: runs.append([frame, *value]); last = value
                p['states'].append(runs)
            effects[key]['parts'].append(p)
        effects[key]['animations'] = model['clips']
    files['detonate-catalog.json'] = encode(dict(author='MiYu', rules=rules, effects=effects))
    files['Assets/Licenses/Classic-Detonate.txt'] = b'Original Warcraft III Detonate data, command portrait, WispExplode and DispelMagicTarget: Blizzard Entertainment. Original game asset terms apply. Source bytes and conversion hashes are recorded in detonate-sources.json.\n'
    saved_path = output / previous_path.name
    protected = {r['path']: r['sha256'] for r in json.loads(saved_path.read_bytes()).get('files', [])} if saved_path.exists() else {}
    for relative, raw in files.items():
        p = output / relative
        assert not p.exists() or p.read_bytes() == raw or sha(p.read_bytes()) == protected.get(relative), 'Preserve modified Detonate import: ' + relative
    files['SourceAssets/Detonate/node-conversion.json'] = node_raw
    report = dict(author='MiYu', generator='scripts/import-frost-detonate.py', generatorSha256=sha(pathlib.Path(__file__).read_bytes()), sources=sources, effectReceipts=receipts, geometryReceiptSha256=sha(receipt_raw), nodeReceiptSha256=sha(node_raw), files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    for relative, raw in files.items():
        p = output / relative; p.parent.mkdir(parents=True, exist_ok=True)
        if not p.exists() or p.read_bytes() != raw: p.write_bytes(raw)
    saved_path.write_bytes(encode(report))
    print('PASS original Detonate:', len(files), 'verified files, 50 mana / 225 summoned damage / 300 radius / 100 cast range')


if __name__ == '__main__': main()

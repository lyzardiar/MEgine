"""Author: MiYu. Import original Dryad art and source rules with signed reproducible outputs."""
import argparse
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base = importlib.import_module('import-frost-druids')
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode
BINDINGS = [
    ('ClassicDryad', 'Dryad', 'game-ready', 'Units/NightElf/Dryad/Dryad.mdx'),
    ('ClassicDryadPortrait', 'Dryad_portrait', 'remaining-ready', 'Units/NightElf/Dryad/Dryad_portrait.mdx'),
    ('ClassicDryadMissile', 'Dryadmissile', 'remaining-ready', 'Abilities/Weapons/Dryadmissile/Dryadmissile.mdx'),
    ('ClassicDispelMagicTarget', 'DispelMagicTarget', 'remaining-ready', 'Abilities/Spells/Human/DispelMagic/DispelMagicTarget.mdx'),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--pose-probe', type=pathlib.Path, default=pathlib.Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'))
    parser.add_argument('--sampler', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/sentinel-bin/MdxExport.dll')
    parser.add_argument('--metadata-reader', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    args = parser.parse_args(); files, sources, archive_sources = {}, [], []
    def run(script, *params): subprocess.run([sys.executable, str(ROOT / 'scripts' / script), *map(str, params)], check=True)
    with tempfile.TemporaryDirectory(prefix='frost-dryad-') as temp:
        work = pathlib.Path(temp); geometry = work / 'geometry'; geometry.mkdir()
        (geometry / 'model-catalog.json').write_bytes(encode({}))
        bindings = work / 'bindings.json'
        bindings.write_bytes(encode(dict(models=[dict(key=k, source=n, pack=p, model=m) for k, n, p, m in BINDINGS])))
        overlay, effects = work / 'overlay', work / 'effects'
        run('convert-frost-classic-billboards.py', '--bindings', bindings, '--output', overlay, '--metadata-reader', args.metadata_reader)
        run('import-frost-classic.py', '--output', geometry, '--keys', *[k for k, _, _, _ in BINDINGS], '--billboard-library', overlay, '--pose-probe', args.pose_probe)
        mesh_receipt = json.loads((geometry / 'classic-sources.json').read_bytes())
        for record in mesh_receipt['files']:
            raw = (geometry / record['path']).read_bytes(); assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
            files[record['path']] = raw
        files['dryad-models.json'] = (geometry / 'model-catalog.json').read_bytes()
        files['SourceAssets/Dryad/node-conversion.json'] = (overlay / 'asset-sources.json').read_bytes()
        effect_source = 'Abilities/Spells/Human/DispelMagic/DispelMagicTarget.mdx'
        run('convert-warcraft-effects.py', '--output', effects, '--sampler', args.sampler, '--source', 'remaining-ready/' + effect_source)
        effect_receipt = json.loads((effects / 'asset-sources.json').read_bytes())
        for record in effect_receipt['generatedFiles']:
            if not record['path'].startswith('Assets/') or record['path'].endswith('effect-catalog.json'): continue
            raw = (effects / record['path']).read_bytes(); assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
            files[record['path']] = raw
        particles = json.loads((effects / 'Assets/WarcraftIII/effect-catalog.json').read_bytes())['models'][0]
        mesh = json.loads(files['dryad-models.json'])['ClassicDispelMagicTarget']
        assert [c['name'] for c in particles['clips']] == [c['name'] for c in mesh['animations']]
        files['dryad-spell-art.json'] = encode(dict(DispelMagicTarget=dict(effect=particles['effect'], parts=mesh['parts'], animations=mesh['animations'], clip=0, duration=mesh['animations'][0]['duration'])))
        files['SourceAssets/Dryad/effect-conversion.json'] = encode(effect_receipt)
        for record in effect_receipt['sourceFiles']:
            raw = (effects / 'SourceAssets' / record['path']).read_bytes(); assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
            files['SourceAssets/Dryad/' + record['path']] = raw
        for _, _, pack, model in BINDINGS:
            library = ROOT / 'asset-library/warcraft-iii' / pack
            original = json.loads((library / 'asset-sources.json').read_bytes())
            record = next(r for r in original['sourceFiles'] if r['path'].replace('\\', '/').lower() == model.lower())
            raw = (library / 'SourceAssets' / pathlib.PureWindowsPath(record['path'])).read_bytes()
            assert sha(raw) == record['sha256'] and len(raw) == record['bytes']
            files['SourceAssets/WarcraftIII/' + model] = raw; sources.append(dict(record, pack=pack))
    signed = {r['path']: r for r in json.loads((SAMPLE / 'druid-sources.json').read_bytes())['files']}
    def original(path):
        p = 'SourceAssets/WarcraftIII/' + path; raw = (SAMPLE / p).read_bytes(); record = signed[p]
        assert sha(raw) == record['sha256'] and len(raw) == record['bytes'], p
        files[p] = raw
        return raw
    tables = {name: base.rows(original('Units/' + name + '.slk')) for name in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'unitUI', 'AbilityData', 'AbilityMetaData', 'UpgradeData']}
    texts = {name: original('Units/NightElf' + name + '.txt') for name in ['UnitFunc', 'UnitStrings', 'AbilityFunc', 'AbilityStrings', 'UpgradeFunc', 'UpgradeStrings']}
    def icons(key, path):
        result = {}
        for field, source in [('icon', path), ('disabledIcon', path.replace('\\CommandButtons\\BTN', '\\CommandButtonsDisabled\\DISBTN'))]:
            relative = 'Assets/Art/classic-' + key + ('-disabled' if field == 'disabledIcon' else '') + '.png'
            # Icons not already signed in Druid sources are extracted from the installed original archives.
            if not archive_sources: archive_sources.extend((name, base.mpyq.MPQArchive(str(args.game / name), listfile=False)) for name in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for archive_name, archive in reversed(archive_sources):
                try: raw = base.read_archive(archive, source); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original Dryad icon: ' + source)
            source = source.replace('\\', '/'); files['SourceAssets/WarcraftIII/' + source] = raw
            sources.append(dict(path=source, archive=archive_name, bytes=len(raw), sha256=sha(raw)))
            files[relative] = base.base.decode_icon(raw); result[field] = relative
        return result
    b, movement, w, ui = [tables[name]['edry'] for name in ['UnitBalance', 'UnitData', 'UnitWeapons', 'unitUI']]
    art, text = base.section(texts['UnitFunc'], 'edry'), base.section(texts['UnitStrings'], 'edry')
    unit = dict(sourceUnit='edry', label='Dryad', model='ClassicDryad', portrait='ClassicDryadPortrait', missile='ClassicDryadMissile', hp=int(b['HP']), armor='unarmored', armorValue=float(b['def']), gold=int(b['goldcost']), wood=int(b['lumbercost']), food=int(b['fused']), time=float(b['bldtm']), damage=float(w['avgdmg1']), attack=w['atkType1'], range=float(w['rangeN1']) / 100, cooldown=float(w['cool1']), speed=float(b['spd']) / 100, collision=float(b['collision']) / 100, antiAir='air' in w['targs1'].split(','), organic=True, maxMana=float(b['manaN']), initialMana=float(b['mana0']), manaRegen=float(b['regenMana']), nightRegen=float(b['regenHP']), damagePoint=float(w['dmgpt1']), modelScale=float(ui['modelScale']), selectionScale=float(ui['scale']), missileSpeed=float(art['Missilespeed']) / 100, missileArc=float(art['Missilearc']), sourceRows={name: tables[name]['edry'] for name in ['UnitBalance', 'UnitData', 'UnitWeapons', 'UnitAbilities', 'unitUI']}, sourceFunc=art, sourceStrings=text, **icons('dryad', art['Art']))
    abilities = {}
    for key in ['Aspo', 'Aadm', 'Amim']:
        ability_art, ability_text = base.section(texts['AbilityFunc'], key), base.section(texts['AbilityStrings'], key)
        abilities[key] = dict(sourceRow=tables['AbilityData'][key], sourceFunc=ability_art, sourceStrings=ability_text, metadata={k:v for k,v in tables['AbilityMetaData'].items() if key in v.get('useSpecific', '').split(',')})
        if 'Art' in ability_art: abilities[key].update(icons(key, ability_art['Art']))
        if 'Unart' in ability_art: abilities[key]['offIcon'] = icons(key + '-off', ability_art['Unart'])['icon']
    research_art = base.section(texts['UpgradeFunc'], 'Resi')
    rules = dict(author='MiYu', schemaVersion=1, sourceUnitsPerWorldUnit=100, units=dict(dryad=unit), abilities=abilities, research=dict(Resi=dict(sourceRow=tables['UpgradeData']['Resi'], sourceFunc=research_art, sourceStrings=base.section(texts['UpgradeStrings'], 'Resi'), **icons('research-Resi', research_art['Art']))), runtimeIntegration='Pending', unverified=['Poison stacking semantics', 'Initial Abolish Magic autocast state'])
    files['dryad-rules.json'] = encode(rules)
    files['Assets/Licenses/Classic-Dryad.txt'] = b'Original Warcraft III Dryad assets and rules belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source archives, hashes and generators are recorded in dryad-sources.json.\n'
    tools = ['scripts/import-frost-dryad-assets.py', 'scripts/import-frost-classic.py', 'scripts/convert-frost-classic-billboards.py', 'scripts/convert-warcraft-effects.py']
    receipt = dict(author='MiYu', generators={p:sha((ROOT / p).read_bytes()) for p in tools}, poseProbeSha256=sha(args.pose_probe.read_bytes()), samplerSha256=sha(args.sampler.read_bytes()), sources=sources, files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    output = args.output.resolve(); receipt_path = output / 'dryad-sources.json'
    previous = json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {}; old = {r['path']:r['sha256'] for r in previous.get('files', [])}
    for p, raw in files.items():
        target = output / p
        assert not target.exists() or target.read_bytes() == raw or sha(target.read_bytes()) == old.get(p), 'Preserve modified Dryad output: ' + p
    for p, raw in files.items():
        target = output / p; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    receipt_path.write_bytes(encode(receipt))
    print('PASS original Dryad art and source rules:', len(files), 'signed outputs')


if __name__ == '__main__': main()

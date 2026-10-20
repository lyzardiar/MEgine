"""Author: MiYu. Reproduce original Crypt Fiend Web rules, research, icons and retained effect sources."""
import argparse
import hashlib
import importlib
import io
import json
from pathlib import Path
import struct
import uuid
from PIL import Image
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-human-army').section
slot = importlib.import_module('import-frost-human-sanctum').slot


def source_path(path):
    parts = path.replace('\\', '/').split('/')
    parts[0] = {'abilities': 'Abilities', 'textures': 'Textures'}.get(parts[0].lower(), parts[0])
    return '/'.join(parts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--source-sample', type=Path, default=SAMPLE)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    args = parser.parse_args()
    receipt = 'crypt-web-sources.json'; source_root = 'SourceAssets/CryptWeb/'
    previous = json.loads((args.output / receipt).read_bytes()) if (args.output / receipt).exists() else {}
    retained = json.loads((args.source_sample / receipt).read_bytes()) if (args.source_sample / receipt).exists() else {}
    files, sources, archives = {}, {}, []
    for record in previous.get('files', []):
        raw = (args.output / record['path']).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Preserve edited output: ' + record['path']

    def original(path):
        archive_path = path.replace('\\', '/'); path = source_path(path)
        if path in sources: return files[source_root + path]
        record = next((r for r in retained.get('sources', []) if source_path(r['path']) == path), None)
        if record:
            raw = (args.source_sample / source_root / record['path']).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Corrupt retained source: ' + path
            record = dict(record, path=path, archivePath=record.get('archivePath', record['path']))
        else:
            assert not retained, 'Missing retained source: ' + path
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'])
            for name, archive in archives:
                try: raw = read_archive(archive, archive_path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise FileNotFoundError(path)
            record = dict(path=path, archivePath=archive_path, archive=name, bytes=len(raw), sha256=sha(raw))
        sources[path] = record; files[source_root + path] = raw
        return raw

    def icons(name, art):
        result = {}
        for disabled in [False, True]:
            path = art.replace('\\', '/')
            if disabled: path = path.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
            stream = io.BytesIO(); Image.open(io.BytesIO(original(path))).convert('RGBA').save(stream, format='PNG')
            key = 'disabledIcon' if disabled else 'icon'; target = 'Assets/Art/classic-crypt-' + name + ('-disabled' if disabled else '') + '.png'
            files[target] = stream.getvalue(); result[key] = target
            files[target + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + target)), importer='texture'))
        return result

    def model(path):
        path = str(Path(path.replace('\\', '/')).with_suffix('.mdx')).replace('\\', '/')
        raw = original(path); assert raw[:4] == b'MDLX', 'Expected original MDX: ' + path
        textures, offset = [], 4
        while offset < len(raw):
            tag, size = struct.unpack_from('<4sI', raw, offset); start = offset + 8; end = start + size
            assert end <= len(raw), 'Truncated MDX: ' + path
            if tag == b'TEXS':
                assert size % 268 == 0, 'Invalid MDX textures: ' + path
                for at in range(start, end, 268):
                    replacement = struct.unpack_from('<I', raw, at)[0]
                    texture = raw[at + 4:at + 264].split(b'\0', 1)[0].decode('utf-8').replace('\\', '/')
                    assert replacement == 0 and texture, 'Unresolved Web texture: ' + path
                    original(texture); textures.append(source_path(texture))
            offset = end
        assert offset == len(raw), 'Invalid MDX chunks: ' + path
        return dict(path=path, textures=textures)

    ability = rows(original('Units/AbilityData.slk'))['Aweb']
    afunc, astrings = [original('Units/UndeadAbility' + name + '.txt') for name in ['Func', 'Strings']]
    func, strings = section(afunc, 'Aweb'), section(astrings, 'Aweb')
    research = rows(original('Units/UpgradeData.slk'))['Ruwb']
    rfunc, rstrings = [section(original('Units/UndeadUpgrade' + name + '.txt'), 'Ruwb') for name in ['Func', 'Strings']]
    metadata = rows(original('Units/AbilityMetaData.slk'))
    metadata = {key: metadata[key] for key in ['Ens1', 'Ens2', 'Ens3']}
    editor_strings = dict(line.split('=', 1) for line in original('UI/WorldEditStrings.txt').decode('utf-8').splitlines() if '=' in line and not line.startswith('//'))
    labels = {v['displayName']: editor_strings[v['displayName']] for v in metadata.values()}
    misc = section(original('Units/MiscGame.txt'), 'Misc')
    source_rows = {name: rows(original('Units/' + name + '.slk'))['ucry'] for name in ['UnitWeapons', 'UnitAbilities']}
    unit_data = rows(original('Units/UnitData.slk'))
    units = {key: dict(moveHeight=float(unit_data[key]['moveHeight'])/100, moveFloor=float(unit_data[key]['moveFloor'])/100, sourceRow=unit_data[key]) for key in ['ucry', 'ugar']}
    w = source_rows['UnitWeapons']
    caster = dict(sourceUnit='ucry', castPoint=float(w['castpt']), castBackswing=float(w['castbsw']), autoAbility=source_rows['UnitAbilities']['auto'], sourceRows=source_rows)
    skill = dict(id='Aweb', name=strings['Name'], duration=float(ability['Dur1']), heroDuration=float(ability['HeroDur1']), mana=float(ability['Cost1']), cooldown=float(ability['Cool1']), range=float(ability['Rng1'])/100, landingTime=float(ability['DataA1']), airHeight=float(ability['DataB1'])/100, meleeRange=float(ability['DataC1'])/100, targets=ability['targs1'].split(','), requires=func['Requires'].split(','), slot=slot(func), hotkey=strings['Hotkey'], order=func['Order'], autoOn=func['Orderon'], autoOff=func['Orderoff'], missileSpeed=float(func['Missilespeed'])/100, missileHoming=func['MissileHoming']=='1', sourceRow=ability, sourceFunc=func, sourceStrings=strings, sourceFieldLabels=labels, **icons('web', func['Art']))
    skill['offIcons'] = icons('web-off', func['Unart'])
    skill['missile'] = model(func['Missileart'])
    upgrade = dict(id='Ruwb', name=rstrings['Name'], gold=int(research['goldbase']), wood=int(research['lumberbase']), time=float(research['timebase']), requires=rfunc['Requires'].split(','), slot=slot(rfunc), hotkey=rstrings['Hotkey'], tooltip=rstrings['Ubertip'].strip('"'), sourceRow=research, sourceFunc=rfunc, sourceStrings=rstrings, **icons('web-research', rfunc['Art']))
    buff_rows = rows(original('Units/AbilityBuffData.slk')); buffs = {}
    for key in ability['BuffID1'].split(','):
        bfunc, bstrings = section(afunc, key), section(astrings, key)
        buffs[key] = dict(sourceRow=buff_rows[key], sourceFunc=bfunc, sourceStrings=bstrings, model=model(bfunc['Targetart']), **icons('web-buff', bfunc['Buffart']))
    files['crypt-web.json'] = encode(dict(author='MiYu', sourceUnitsPerWorldUnit=100, ability=skill, research=upgrade, caster=caster, units=units, buffs=buffs, metadata=metadata, misc=dict(WebIsMagic=int(misc['WebIsMagic'])), magicRule=dict(sourceFile='Units/MiscGame.txt', sourceSection='Misc', sourceField='WebIsMagic', physicalValue=0, magicalWhenNonzero=True, reaVtable='0x6fa1ddec', reaVtableOffset='0x1d8', reaFunction='0x6f5cca10')))
    files['Assets/Licenses/Classic-Crypt-Web.txt'] = b'Original Warcraft III Web data, command textures, effect models and textures: Blizzard Entertainment original game asset terms apply. MPQ paths and SHA-256 are retained in crypt-web-sources.json. Extraction does not grant redistribution rights.\n'
    for _, archive in archives: archive.file.close()
    for path, raw in files.items():
        target = args.output / path
        if target.exists() and target.read_bytes() != raw: assert any(r['path'] == path and r['sha256'] == sha(target.read_bytes()) for r in previous.get('files', [])), 'Preserve edited output: ' + path
    for path, raw in files.items():
        target = args.output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    manifest = dict(author='MiYu', generator='scripts/import-frost-crypt-web.py', generatorSha256=sha(Path(__file__).read_bytes()), gameDirectory=retained.get('gameDirectory', str(args.game)), reaSource='https://github.com/morluto/rea', reaVersion='6.5.0', reaEvidence='tmp/docs-artifacts/frost-crypt-web/', sources=list(sources.values()), files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p,raw in files.items()], originalRuntimeVerified=False, license='Blizzard Entertainment original game terms')
    (args.output / receipt).write_bytes(encode(manifest))
    print('PASS source Web: research, metadata, magic condition, original icons/models and ' + str(len(files)) + ' signed outputs')


if __name__ == '__main__': main()

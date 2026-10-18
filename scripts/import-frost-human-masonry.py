"""Author: MiYu. Preserve original Rhac ranks, affected building balance and command art."""
import argparse
import csv
import hashlib
import importlib
import io
import json
import pathlib
import uuid
from PIL import Image
from warcraft_mpq import mpyq, read_archive

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    args = parser.parse_args(); output = args.output.resolve()
    receipt_path = SAMPLE / 'human-masonry-sources.json'
    previous = json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {}
    retained = {r['path']: r for r in previous.get('sources', [])}
    packs = [(name, mpyq.MPQArchive(str(args.game / name), listfile=False)) for name in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'] if (args.game / name).exists()]
    files, sources = {}, {}
    def original(path):
        if path in sources: return files[sources[path]['localPath']]
        for archive, pack in packs:
            try: raw = read_archive(pack, path.replace('/', '\\')); break
            except FileNotFoundError: continue
        else:
            old = retained[path]; raw = (SAMPLE / old['localPath']).read_bytes(); archive = old['archive']; assert sha(raw) == old['sha256']
        local = 'SourceAssets/HumanMasonry/' + path
        files[local] = raw; sources[path] = dict(path=path, localPath=local, archive=archive, bytes=len(raw), sha256=sha(raw)); return raw
    rows = importlib.import_module('import-frost-wisp-rules').rows
    section = importlib.import_module('import-frost-human-army').section
    upgrade = rows(original('Units/UpgradeData.slk'))['Rhac']
    effects = rows(original('Units/UpgradeEffectMetaData.slk'))
    balance = rows(original('Units/UnitBalance.slk'))
    unit_func = original('Units/HumanUnitFunc.txt'); unit_strings = original('Units/HumanUnitStrings.txt')
    func = section(original('Units/HumanUpgradeFunc.txt'), 'Rhac')
    strings = section(original('Units/HumanUpgradeStrings.txt'), 'Rhac')
    assert 'Rhac' in section(unit_func, 'hlum')['Researches'].split(',') and upgrade['effect1']=='rarm' and upgrade['effect2']=='rhpo'
    ranks = lambda value: next(csv.reader([value]))
    def icons(stem, source):
        result = {}
        for disabled in [False, True]:
            path = source.replace('\\', '/')
            if disabled: path = path.replace('CommandButtons/BTN', 'CommandButtonsDisabled/DISBTN')
            image = Image.open(io.BytesIO(original(path))).convert('RGBA'); buffer = io.BytesIO(); image.save(buffer, format='PNG')
            target = 'Assets/Art/classic-masonry-' + stem + ('-disabled' if disabled else '') + '.png'
            files[target] = buffer.getvalue(); files[target+'.meta'] = encode(dict(version=1,uuid=str(uuid.uuid5(uuid.NAMESPACE_URL,target))))
            result['disabledIcon' if disabled else 'icon'] = target
        return result
    names, tips, tooltips, hotkeys, art = [ranks(v) for v in [strings['Name'], strings['Tip'], strings['Ubertip'], strings['Hotkey'], func['Art']]]
    levels = []
    for i in range(int(upgrade['maxlevel'])):
        requirement = func['Requires'+(str(i) if i else '')]
        levels.append(dict(rank=i+1,name=names[i],tip=tips[i],tooltip=tooltips[i],hotkey=hotkeys[i],gold=int(upgrade['goldbase'])+i*int(upgrade['goldmod']),wood=int(upgrade['lumberbase'])+i*int(upgrade['lumbermod']),time=float(upgrade['timebase'])+i*float(upgrade['timemod']),healthFraction=float(upgrade['base2'])+i*float(upgrade['mod2']),requires=requirement.split(',') if requirement else [],**icons(str(i+1),art[i])))
    bindings=dict(barracks='hbar',blacksmith='hbla',lumbermill='hlum',arcanesanctum='hars',workshop='harm',farm='hhou',altar='halt',shop='hvlt',scouttower='hwtw',guardtower='hgtw',tower='hgtw')
    unit_profiles = {}
    for source, row in balance.items():
        if 'Rhac' not in row.get('upgrades','').split(','): continue
        ufunc=section(unit_func,source); text=section(unit_strings,source)
        unit_profiles[source]=dict(sourceUnit=source,hp=int(row['HP']),armorValue=float(row['def']),armorPerRank=float(row['defUp']),armor={'fort':'fortified','small':'light','medium':'medium','large':'heavy','none':'unarmored','hero':'hero'}[row['defType']],gold=int(row['goldcost']),wood=int(row['lumbercost']),time=float(row['bldtm']),speed=0,mana=0,sourceBalance=row,sourceFunc=ufunc,sourceStrings=text)
        if source in bindings.values():unit_profiles[source].update(icons(source,ufunc['Art'].split(',')[0]))
    rules=dict(author='MiYu',research='Rhac',producer='lumbermill',sourceProducer='hlum',slot=sum(int(v)*f for v,f in zip(func['Buttonpos'].split(','),[1,4])),levels=levels,bindings=bindings,hallSources=['htow','hkee','hcas'],units=unit_profiles,sourceRow=upgrade,sourceFunc=func,sourceStrings=strings,guardTowerReference='https://classic.battle.net/war3/human/buildings/guardtower.shtml',sourceEffectMetadata={k:v for k,v in effects.items() if v['effectID'] in ['rhpo','rarm']})
    files['human-masonry.json']=encode(rules)
    files['Assets/Licenses/Classic-Human-Masonry.txt'] = b'Warcraft III Rhac research, Human building balance, metadata, localized text and command icons: Blizzard Entertainment. Original game asset terms apply; these assets are not CC0 or MIT. Original MPQ bytes, archive precedence and SHA-256 hashes are preserved in human-masonry-sources.json.\n'
    for path, raw in files.items():
        target = output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    receipt = dict(author='MiYu',archivePrecedence=['War3Patch.mpq','War3xLocal.mpq','War3x.mpq','war3.mpq'],sources=list(sources.values()),generator='scripts/import-frost-human-masonry.py',generatorSha256=sha(pathlib.Path(__file__).read_bytes()),files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in files.items()],reaEvidence='tmp/docs-artifacts/frost-human-masonry/',originalRuntimeVerified=False)
    (output / 'human-masonry-sources.json').write_bytes(encode(receipt))
    print('PASS source Rhac ranks, affected Human building balances and original command icons')


if __name__ == '__main__': main()

"""Author: MiYu. Preserve original Rhlh ranks, worker binding, effect metadata and command art."""
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
    receipt_path = SAMPLE / 'lumber-technology-sources.json'
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
        local = 'SourceAssets/LumberTechnology/' + path
        files[local] = raw; sources[path] = dict(path=path, localPath=local, archive=archive, bytes=len(raw), sha256=sha(raw)); return raw
    rows = importlib.import_module('import-frost-wisp-rules').rows
    section = importlib.import_module('import-frost-human-army').section
    upgrade = rows(original('Units/UpgradeData.slk'))['Rhlh']
    effects = rows(original('Units/UpgradeEffectMetaData.slk'))
    balance = rows(original('Units/UnitBalance.slk'))['hpea']
    func = section(original('Units/HumanUpgradeFunc.txt'), 'Rhlh')
    strings = section(original('Units/HumanUpgradeStrings.txt'), 'Rhlh')
    producer = section(original('Units/HumanUnitFunc.txt'), 'hlum')
    assert 'Rhlh' in balance['upgrades'].split(',') and 'Rhlh' in producer['Researches'].split(',') and upgrade['effect1'] == 'rlum'
    ranks = lambda value: next(csv.reader([value]))
    names, tips, tooltips, hotkeys, art = [ranks(v) for v in [strings['Name'], strings['Tip'], strings['Ubertip'], strings['Hotkey'], func['Art']]]
    levels = []
    for i in range(int(upgrade['maxlevel'])):
        icons = {}
        for disabled in [False, True]:
            source = art[i].replace('\\', '/')
            if disabled: source = source.replace('CommandButtons/BTN', 'CommandButtonsDisabled/DISBTN')
            image = Image.open(io.BytesIO(original(source))).convert('RGBA'); buffer = io.BytesIO(); image.save(buffer, format='PNG')
            path = 'Assets/Art/classic-lumber-harvest-' + str(i + 1) + ('-disabled' if disabled else '') + '.png'
            files[path] = buffer.getvalue(); files[path + '.meta'] = encode(dict(version=1, uuid=str(uuid.uuid5(uuid.NAMESPACE_URL, path))))
            icons['disabledIcon' if disabled else 'icon'] = path
        levels.append(dict(rank=i+1, name=names[i], tip=tips[i], tooltip=tooltips[i].replace('<Rhlh,mod1>', upgrade['mod1']), hotkey=hotkeys[i], gold=int(upgrade['goldbase'])+i*int(upgrade['goldmod']), wood=int(upgrade['lumberbase'])+i*int(upgrade['lumbermod']), time=float(upgrade['timebase'])+i*float(upgrade['timemod']), bonus=int(upgrade['base1'])+i*int(upgrade['mod1']), requires=func['Requires' + (str(i) if i else '')].split(','), **icons))
    rules = dict(author='MiYu',effectInterpretation=dict(field='DataB',abilityOffset='0x198',stat='capacity',upgradeMethod='0x6f698dd0',capacityWriteMethod='0x6f3de1c0'),research='Rhlh',producer='lumbermill',sourceProducer='hlum',sourceUnit='hpea',slot=sum(int(v)*f for v,f in zip(func['Buttonpos'].split(','),[1,4])),levels=levels,sourceRow=upgrade,sourceFunc=func,sourceStrings=strings,sourceBalance=balance,sourceProducerFunc=producer,sourceEffectMetadata={k:v for k,v in effects.items() if v['effectID']=='rlum'})
    files['lumber-technology.json'] = encode(rules)
    files['Assets/Licenses/Classic-Lumber-Technology.txt'] = b'Warcraft III Rhlh research definitions, metadata, localized text and command icons: Blizzard Entertainment. Original game asset terms apply; these assets are not CC0 or MIT. Original MPQ bytes, archive precedence and SHA-256 hashes are preserved in lumber-technology-sources.json.\n'
    for path, raw in files.items():
        target = output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    receipt = dict(author='MiYu',archivePrecedence=['War3Patch.mpq','War3xLocal.mpq','War3x.mpq','war3.mpq'],sources=list(sources.values()),generator='scripts/import-frost-lumber-technology.py',generatorSha256=sha(pathlib.Path(__file__).read_bytes()),files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in files.items()],reaEvidence='tmp/docs-artifacts/frost-lumber-upgrade/',originalRuntimeVerified=False)
    (output / 'lumber-technology-sources.json').write_bytes(encode(receipt))
    print('PASS source Rhlh ranks, Keep/Castle prerequisites, Peasant binding, rlum metadata and four command icons')


if __name__ == '__main__': main()

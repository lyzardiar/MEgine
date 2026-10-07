"""Author: MiYu. Import original Renb research, per-unit bonuses and command icons."""
import argparse
import importlib
import json
import pathlib
import re
from warcraft_mpq import mpyq, read_archive

base = importlib.import_module('import-frost-entangled-assets')
rows = importlib.import_module('import-frost-wisp-rules').rows
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode


def section(raw, key):
    text = re.search(r'^\[' + key + r'\]\s*\n(.*?)(?=^\[|\Z)', raw.decode('utf-8'), re.M | re.S)[1]
    return dict(line.split('=', 1) for line in text.splitlines() if '=' in line and not line.startswith('//'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path(r'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); output = args.output.resolve()
    previous_path = SAMPLE / 'natures-blessing-sources.json'
    previous = json.loads(previous_path.read_bytes()) if previous_path.exists() else {}
    files, sources, archives = {}, [], []
    def original(path):
        saved = next((r for r in previous.get('sources', []) if r['path'] == path), None)
        if saved:
            raw = (SAMPLE / 'SourceAssets/WarcraftIII' / path).read_bytes()
            assert len(raw) == saved['bytes'] and sha(raw) == saved['sha256'], path
            record = saved
        else:
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n))) for n in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original Renb source: ' + path)
            record = dict(path=path, archive=name, bytes=len(raw), sha256=sha(raw))
        files['SourceAssets/WarcraftIII/' + path] = raw; sources.append(record)
        return raw
    upgrade = rows(original('Units/UpgradeData.slk'))['Renb']
    balance = rows(original('Units/UnitBalance.slk'))
    art = section(original('Units/NightElfUpgradeFunc.txt'), 'Renb')
    strings = section(original('Units/NightElfUpgradeStrings.txt'), 'Renb')
    functions = original('Units/NightElfUnitFunc.txt')
    assert upgrade['maxlevel'] == '1' and upgrade['effect1'] == 'rmvx' and upgrade['effect2'] == 'rarm' and art['Buttonpos'] == '2,0' and art['Requires'] == 'etoa' and strings['Hotkey'] == 'N'
    units = {k: dict(armorValue=float(v['def']), armorBonus=float(v['defUp']), speed=float(v['spd']) / 100) for k, v in balance.items() if 'Renb' in v.get('upgrades', '').split(',')}
    bindings = dict(hall=['etol', 'etoa', 'etoe'], barracks='eaom', tower='etrp', shop='eden', treant='efon')
    for key in bindings['hall']: assert 'Renb' in section(functions, key)['Researches'].split(',')
    for kind, key in [('barracks', 'WildwoodBarracks'), ('tower', 'WildwoodTower'), ('shop', 'WildwoodShop')]:
        assert json.loads((SAMPLE / 'building-scale-catalog.json').read_bytes())['models'][key]['unit'] == bindings[kind]
    icon = art['Art'].replace('\\', '/')
    for key, path in [('natures-blessing', icon), ('natures-blessing-disabled', icon.replace('CommandButtons/BTN', 'CommandButtonsDisabled/DISBTN'))]:
        files['Assets/Art/classic-' + key + '.png'] = base.decode_icon(original(path))
    catalog = dict(author='MiYu', sourceUpgrade='Renb', sourceUnitsPerWorldUnit=100, name="Nature's Blessing", gold=int(upgrade['goldbase']), wood=int(upgrade['lumberbase']), time=float(upgrade['timebase']), tier=2, speedBonus=float(upgrade['base1']) / 100, slot=2, hotkey='N', bindings=bindings, units=units, sourceRow=upgrade, sourceArt=art)
    files['natures-blessing.json'] = encode(catalog)
    files['Assets/Licenses/Classic-Natures-Blessing.txt'] = b'Nature\'s Blessing research/unit data and command icons: Blizzard Entertainment, original Warcraft III game asset terms apply. Source paths, archive identities, hashes and selected rows are recorded in natures-blessing-sources.json and natures-blessing.json.\n'
    old = {f['path']: f['sha256'] for f in previous.get('files', [])}
    for relative, raw in files.items():
        target = output / relative
        if target.exists() and target.read_bytes() != raw: assert sha(target.read_bytes()) == old.get(relative), 'Preserve modified Nature\'s Blessing asset: ' + relative
    for relative, raw in files.items():
        target = output / relative; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    generator = 'scripts/import-frost-natures-blessing.py'
    receipt = dict(author='MiYu', generator=generator, generatorSha256=sha((ROOT / generator).read_bytes()), sources=sources, files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    (output / 'natures-blessing-sources.json').write_bytes(encode(receipt))
    print('PASS original Renb: 150 gold / 200 lumber / 60s, tier 2, +40 source movement, per-unit armor and source icons')


if __name__ == '__main__': main()

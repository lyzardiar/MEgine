"""Author: MiYu. Retain original Sorceress buffs, four fixed sheep identities and command sidecars."""
import argparse
import hashlib
import importlib
import json
import pathlib
import uuid
from warcraft_mpq import mpyq, read_archive

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--source-root', type=pathlib.Path)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); output = args.output.resolve(); source = args.source_root or SAMPLE; name = 'human-sorceress-sources.json'; prefix = 'SourceAssets/HumanSorceress/'
    old = json.loads((output / name).read_bytes()) if (output / name).exists() else {}; files = {}; sources = []; dependencies = []; archives = []
    for r in old.get('outputs', []):
        raw = (output / r['path']).read_bytes()
        if len(raw) != r['bytes'] or sha(raw) != r['sha256']: raise ValueError('Modified signed Sorceress output: ' + r['path'])
    retained = json.loads((source / name).read_bytes()) if args.source_root else {}
    def dependency(path):
        raw = (source / path).read_bytes()
        if args.source_root:
            r = next(r for r in retained['dependencies'] if r['path'] == path)
            if len(raw) != r['bytes'] or sha(raw) != r['sha256']: raise ValueError('Corrupt Sorceress dependency: ' + path)
        dependencies.append(dict(path=path, bytes=len(raw), sha256=sha(raw))); return raw
    def original(path):
        if args.source_root:
            record = next(r for r in retained['sources'] if r['path'] == path); raw = (source / prefix / path).read_bytes()
            if len(raw) != record['bytes'] or sha(raw) != record['sha256']: raise ValueError('Corrupt Sorceress source: ' + path)
        else:
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['War3Patch.mpq', 'War3x.mpq', 'War3.mpq'])
            for archive, mpq in archives:
                try: raw = read_archive(mpq, path.replace('/', '\\'))
                except FileNotFoundError: continue
                if raw: break
            else: raise FileNotFoundError(path)
            record = dict(path=path, archive=archive, bytes=len(raw), sha256=sha(raw))
        files[prefix + path] = raw; sources.append(record); return raw
    try:
        rules = json.loads(dependency('human-sanctum.json')); funcs = dependency('SourceAssets/HumanSanctum/Units/HumanAbilityFunc.txt'); rows = importlib.import_module('import-frost-wisp-rules').rows; section = importlib.import_module('import-frost-human-army').section
        buffs = rows(original('Units/AbilityBuffData.slk')); tables = {n: rows(original('Units/' + n + '.slk')) for n in ['UnitBalance', 'UnitData', 'UnitUI']}; neutral = original('Units/NeutralUnitFunc.txt'); forms = {}
        for movement, id in rules['abilities']['Aply']['forms'].items():
            b, d, ui = [tables[n][id] for n in ['UnitBalance', 'UnitData', 'UnitUI']]
            forms[id] = dict(id=id, category=movement, model='ClassicPolymorph' + id, sourceModel=ui['file'], modelScale=float(ui['modelScale']), selectionScale=float(ui['scale']), speed=float(b['spd']) / 100, movement=d['movetp'], armor=b['defType'], sourceRows={n: tables[n][id] for n in tables}, sourceFunc=section(neutral, id))
        for id in ['Aivs', 'Aply']:
            for field in ['icon', 'disabledIcon']:
                icon = rules['abilities'][id][field]; dependency(icon); files[icon + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + icon)), importer='texture'))
        buff_ids = [rules['abilities'][id]['sourceRow']['BuffID1'] for id in ['Aivs', 'Aply']]
        files['human-sorceress-spells.json'] = encode(dict(author='MiYu', sourceAbilityIds=['Aivs', 'Aply'], buffs={id: dict(sourceRow=buffs[id], sourceFunc=section(funcs, id)) for id in buff_ids}, forms=forms, reference='https://classic.battle.net/war3/human/units/sorceress.shtml', referenceCooldownDiffers=True, originalRuntimeVerified=False))
        owned = {r['path'] for r in old.get('outputs', [])}
        for path in files:
            if (output / path).exists() and path not in owned: raise ValueError('Unsigned Sorceress output exists: ' + path)
        for path, raw in files.items(): target = output / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(raw)
        receipt = dict(author='MiYu', schemaVersion=1, sources=sources, dependencies=dependencies, outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())], generator=dict(path='scripts/import-frost-human-sorceress.py', sha256=sha(pathlib.Path(__file__).read_bytes().replace(b'\r\n', b'\n'))), originalRuntimeVerified=False)
        (output / name).write_bytes(encode(receipt)); print('PASS Sorceress original buffs, four fixed sheep forms and signed command sidecars')
    finally:
        for _, archive in archives: archive.file.close()


if __name__ == '__main__': main()

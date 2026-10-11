"""Author: MiYu. Retain original Priest buff identity and deterministic command texture sidecars."""
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
    args = parser.parse_args(); output = args.output.resolve(); source = args.source_root or SAMPLE; receipt_name = 'human-priest-sources.json'; prefix = 'SourceAssets/HumanPriest/'
    old = json.loads((output / receipt_name).read_bytes()) if (output / receipt_name).exists() else {}
    for r in old.get('outputs', []):
        raw = (output / r['path']).read_bytes()
        if len(raw) != r['bytes'] or sha(raw) != r['sha256']: raise ValueError('Modified signed Priest output: ' + r['path'])
    retained = json.loads((source / receipt_name).read_bytes()) if args.source_root else {}; dependencies = []; files = {}
    def dependency(path):
        raw = (source / path).read_bytes()
        if args.source_root:
            r = next(r for r in retained['dependencies'] if r['path'] == path)
            if len(raw) != r['bytes'] or sha(raw) != r['sha256']: raise ValueError('Corrupt Priest dependency: ' + path)
        dependencies.append(dict(path=path, bytes=len(raw), sha256=sha(raw))); return raw
    rules = json.loads(dependency('human-sanctum.json')); func = dependency('SourceAssets/HumanSanctum/Units/HumanAbilityFunc.txt'); strings = dependency('SourceAssets/HumanSanctum/Units/HumanAbilityStrings.txt')
    path = 'Units/AbilityBuffData.slk'
    if args.source_root:
        record = next(r for r in retained['sources'] if r['path'] == path); raw = (source / prefix / path).read_bytes()
        if len(raw) != record['bytes'] or sha(raw) != record['sha256']: raise ValueError('Corrupt Priest source: ' + path)
    else:
        for archive in ['War3Patch.mpq', 'War3x.mpq', 'War3.mpq']:
            try: raw = read_archive(mpyq.MPQArchive(str(args.game / archive), listfile=False), path.replace('/', '\\'))
            except FileNotFoundError: continue
            if raw: break
        else: raise FileNotFoundError(path)
        record = dict(path=path, archive=archive, bytes=len(raw), sha256=sha(raw))
    files[prefix + path] = raw
    buff = importlib.import_module('import-frost-wisp-rules').rows(raw)['Binf']; section = importlib.import_module('import-frost-human-army').section
    buff_func = section(func, 'Binf'); buff_strings = section(strings, 'Binf')
    assert rules['abilities']['Ainf']['sourceRow']['BuffID1'] == buff['alias'] == 'Binf' and buff_func['Targetattach'] == 'overhead'
    for id in ['Adis', 'Ainf']:
        for field in ['icon', 'disabledIcon', 'offIcon']:
            icon = rules['abilities'][id].get(field)
            if not icon: continue
            dependency(icon); files[icon + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + icon)), importer='texture'))
    files['human-priest-spells.json'] = encode(dict(author='MiYu', sourceAbilityIds=['Adis', 'Ainf'], buffSource=buff, buffFunc=buff_func, buffStrings=buff_strings, healHoldAutocast=False, reference='https://classic.battle.net/war3/human/units/priest.shtml'))
    owned = {r['path'] for r in old.get('outputs', [])}
    for path in files:
        if (output / path).exists() and path not in owned: raise ValueError('Unsigned Priest output exists: ' + path)
    for path, raw in files.items(): target = output / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(raw)
    receipt = dict(author='MiYu', schemaVersion=1, sources=[record], dependencies=dependencies, outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())], generator=dict(path='scripts/import-frost-human-priest.py', sha256=sha(pathlib.Path(__file__).read_bytes().replace(b'\r\n', b'\n'))), originalRuntimeVerified=False)
    (output / receipt_name).write_bytes(encode(receipt)); print('PASS Priest source buff and command icon sidecars')


if __name__ == '__main__': main()

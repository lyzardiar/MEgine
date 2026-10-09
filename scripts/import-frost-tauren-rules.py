"""Author: MiYu. Derive Tauren Chieftain rules and editor field meanings from signed original sources."""
import argparse
import importlib
import json
from pathlib import Path
from warcraft_mpq import mpyq, read_archive

base = importlib.import_module('import-frost-orc-heroes')
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--source-root', type=Path, default=SAMPLE)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); source = args.source_root.resolve(); output = args.output.resolve(); filename = 'tauren-rules-sources.json'
    old = json.loads((output / filename).read_bytes()) if (output / filename).exists() else {}; owned = {r['path']: r for r in old.get('outputs', [])}
    for p, r in owned.items():
        raw = (output / p).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Modified generated output: ' + p
    manifest = json.loads((source / 'orc-hero-sources.json').read_bytes())
    prior = json.loads((source / filename).read_bytes()) if (source / filename).exists() else {}
    signed = {r['path'].lower(): r for r in manifest['sources'] + prior.get('sources', [])}; used = {}; files = {}; archives = []
    def original(path):
        if path.lower() in signed:
            r = signed[path.lower()]; raw = (source / r['output']).read_bytes()
            assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Source fingerprint mismatch: ' + path
        else:
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for name, archive in reversed(archives):
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original source: ' + path)
            r = dict(path=path, output='SourceAssets/Tauren/rules/' + path, archive=name, bytes=len(raw), sha256=sha(raw))
        used[path] = r
        if r['output'].startswith('SourceAssets/Tauren/'): files[r['output']] = raw
        return raw
    try:
        raw = (source / 'orc-hero-rules.json').read_bytes(); record = next(r for r in manifest['outputs'] if r['path'] == 'orc-hero-rules.json')
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Orc hero rules fingerprint mismatch'
        heroes = json.loads(raw); unit = heroes['units']['Otch']; ids = unit['commandOrder']
        metadata = base.rows(original('Units/AbilityMetaData.slk')); buffs = base.rows(original('Units/AbilityBuffData.slk'))
        editor = original('UI/WorldEditStrings.txt')
        try: editor = editor.decode('utf-8-sig')
        except UnicodeDecodeError: editor = editor.decode('gb18030')
        labels = dict(line.split('=', 1) for line in editor.splitlines() if line.startswith('WESTRING_') and '=' in line)
        fields = {id: [dict(id=key, sourceRow=r, label=labels[r['displayName']]) for key, r in metadata.items() if id in r.get('useSpecific', '').split(',') and r.get('field') == 'Data'] for id in ids}
        rules = dict(author='MiYu', schemaVersion=1, unit=unit, abilities={id: heroes['abilities'][id] for id in ids}, buffs={id: heroes['buffs'][id] for id in ['BOae', 'BPSE']}, reincarnationEffect=buffs['XOre'], fieldMetadata=fields, misc=heroes['misc'], runtimeIntegrated=False, originalRuntimeVerified=False)
        files['tauren-rules.json'] = encode(rules)
        for p, raw in files.items():
            if (output / p).exists() and p not in owned: assert (output / p).read_bytes() == raw, 'Unowned output collision: ' + p
        tools = ['scripts/import-frost-tauren-rules.py', 'scripts/import-frost-orc-heroes.py', 'scripts/import-frost-wisp-rules.py', 'scripts/warcraft_mpq.py']
        result = dict(author='MiYu', sources=list(used.values()), inputs=[dict(path='orc-hero-rules.json', bytes=record['bytes'], sha256=record['sha256'])], generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes().replace(b'\r\n', b'\n'))) for p in tools], outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in files.items()], runtimeIntegrated=False, originalRuntimeVerified=False)
        for p, raw in files.items():
            dest = output / p; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(raw)
        (output / filename).write_bytes(encode(result)); print('PASS original Tauren rules, four source command cards and editor field meanings')
    finally:
        for _, archive in archives: archive.file.close()


if __name__ == '__main__': main()

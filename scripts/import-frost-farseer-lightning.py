"""Author: MiYu. Preserve original CLPB/CLSB lightning rows and BLP textures with offline reproduction."""
import argparse
import importlib
import json
from pathlib import Path

base = importlib.import_module('import-frost-orc-heroes')
decode_texture = importlib.import_module('import-frost-blood-mage').decode_texture
from warcraft_mpq import mpyq, read_archive

ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=SAMPLE)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); output = args.output.resolve(); source = args.source_root.resolve()
    receipt = 'farseer-lightning-sources.json'; previous = json.loads((source / receipt).read_bytes()) if (source / receipt).exists() else {}
    old = json.loads((output / receipt).read_bytes()) if (output / receipt).exists() else {}; owned = {r['path']: r for r in old.get('outputs', [])}
    for p, r in owned.items():
        raw = (output / p).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Modified lightning output: ' + p
    files, sources, archives = {}, [], []
    signed = {r['path']: r for r in previous.get('sources', [])}
    def original(path):
        path = path.replace('\\', '/'); target = 'SourceAssets/Farseer/Lightning/' + path
        if path in signed:
            r = signed[path]; raw = (source / r['output']).read_bytes(); assert sha(raw) == r['sha256'] and len(raw) == r['bytes']; archive = r['archive']
        else:
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq'])
            for archive, mpq in reversed(archives):
                try: raw = read_archive(mpq, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing original lightning source: ' + path)
        files[target] = raw; sources.append(dict(path=path, output=target, archive=archive, bytes=len(raw), sha256=sha(raw))); return raw
    try:
        table = base.rows(original('Splats/LightningData.slk')); rules = {}
        for key in ['CLPB', 'CLSB']:
            row = dict(table[key]); raw = original(row['Dir'] + '/' + row['file']); texture = 'Assets/Farseer/Lightning/' + Path(row['file']).with_suffix('.png').name
            files[texture] = decode_texture(raw); row['texture'] = texture; rules[key] = row
        files['farseer-lightning.json'] = encode(dict(author='MiYu', lightning=rules, originalRuntimeVerified=False))
        for p, raw in files.items():
            if (output / p).exists() and p not in owned: assert (output / p).read_bytes() == raw, 'Unowned lightning output: ' + p
        generators = ['scripts/import-frost-farseer-lightning.py', 'scripts/import-frost-blood-mage.py', 'scripts/import-frost-orc-heroes.py', 'scripts/warcraft_mpq.py']
        result = dict(author='MiYu', sources=sources, generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes().replace(b'\r\n', b'\n'))) for p in generators], outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in files.items()], originalRuntimeVerified=False)
        for p, raw in files.items():
            dest = output / p; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(raw)
        (output / receipt).write_bytes(encode(result)); print('PASS original CLPB/CLSB source rows and lightning textures:', len(files), 'files')
    finally:
        for _, mpq in archives: mpq.file.close()


if __name__ == '__main__': main()

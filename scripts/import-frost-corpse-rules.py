"""Author: MiYu. Reproduce corpse timing and death flags from retained Warcraft source tables."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path

base = importlib.import_module('import-frost-orc-heroes')
ROOT, SAMPLE = base.ROOT, base.SAMPLE


def sha(raw): return hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--source-root', type=Path)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); output = args.output.resolve(); source = args.source_root
    receipt_name = 'corpse-rules-sources.json'
    previous = json.loads((output / receipt_name).read_bytes()) if (output / receipt_name).exists() else {}
    for record in previous.get('outputs', []):
        raw = (output / record['path']).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Modified output: ' + record['path']
    fingerprints = {r['path']: r for r in json.loads((source / receipt_name).read_bytes())['sources']} if source else {}
    files, sources = {}, []
    for path in ['Units/MiscData.txt', 'Units/UnitData.slk']:
        dest = 'SourceAssets/CorpseRules/' + path
        if source:
            record = fingerprints[path]; raw = (source / record['output']).read_bytes()
            assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Source fingerprint mismatch: ' + path
        else:
            for name in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq']:
                try: raw = base.read_archive(base.mpyq.MPQArchive(str(args.game / name), listfile=False), path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise ValueError('Missing source: ' + path)
            record = dict(path=path, archive=name, output=dest, bytes=len(raw), sha256=sha(raw))
        files[dest] = raw; sources.append(record)
    misc = base.section(files['SourceAssets/CorpseRules/Units/MiscData.txt'], 'Misc')
    rows = base.rows(files['SourceAssets/CorpseRules/Units/UnitData.slk'])
    units = {key: dict(deathTime=base.number(row['death']), deathType=int(row['deathType'])) for key, row in sorted(rows.items())}
    assert all(u['deathTime'] >= 0 and u['deathType'] in [0, 2, 3] for u in units.values())
    data = dict(author='MiYu', schemaVersion=1, timings={key: float(misc[key]) for key in ['BoneDecayTime', 'DecayTime', 'DissipateTime', 'StructureDecayTime']}, units=units, originalRuntimeVerified=False, scope='Source death times and death flags; Death, Decay Flesh and Decay Bone presentation durations. Original executable phase transitions remain unaccepted.')
    files['corpse-rules.json'] = base.encode(data)
    receipt = dict(author='MiYu', generator='scripts/import-frost-corpse-rules.py', generatorSha256=sha(Path(__file__).read_bytes().replace(b'\r\n', b'\n')), sources=sources, outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    for p, raw in files.items():
        target = output / p; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(raw)
    (output / receipt_name).write_bytes(base.encode(receipt))
    print(json.dumps(dict(units=len(units), timings=data['timings'], sources=len(sources))))


if __name__ == '__main__': main()

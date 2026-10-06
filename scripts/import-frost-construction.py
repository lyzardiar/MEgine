"""Author: MiYu. Import verified source-addressed construction assets without overwriting user edits."""
import argparse
import importlib
import json
import pathlib

base = importlib.import_module('convert-frost-classic-billboards')
ROOT = base.ROOT


def visible_clips(attachment, sequences):
    track = attachment['visibility']
    if not track or not track['times']: return list(range(len(sequences)))
    if track['interpolation'] > 1: return list(range(len(sequences)))
    result = []
    for index, sequence in enumerate(sequences):
        values = track['values'] if track['globalSequence'] >= 0 else [value for time, value in zip(track['times'], track['values']) if sequence['start'] <= time <= sequence['end']]
        if not values or any(v[0] > .001 for v in values): result.append(index)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', type=pathlib.Path, default=base.LIBRARY / 'construction-ready')
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'samples/frostbound-realms')
    args = parser.parse_args(); library = args.library.resolve(); output = args.output.resolve()
    receipt_raw = (library / 'asset-sources.json').read_bytes(); receipt = json.loads(receipt_raw)
    for path, digest in receipt['converter'].items(): assert base.digest((ROOT / path).read_bytes()) == digest, path
    owner_receipts = receipt.get('ownerReceipts', [dict(path='asset-library/warcraft-iii/classic-attachment-ready', sha256=receipt.get('ownerReceiptSha256'))])
    for owner in owner_receipts: assert base.digest((ROOT / owner['path'] / 'asset-sources.json').read_bytes()) == owner['sha256']
    assert base.digest((base.LIBRARY / 'remaining-ready/asset-sources.json').read_bytes()) == receipt['sourceReceiptSha256']
    generated = {}
    for f in receipt['generatedFiles']:
        raw = (library / f['path']).read_bytes(); assert len(raw) == f['bytes'] and base.digest(raw) == f['sha256'], f['path']
        if f['path'].startswith('Assets/'): generated[f['path']] = raw
    owners = {}
    for source_owner in owner_receipts:
        owner_root = ROOT / source_owner['path']; owner = json.loads((owner_root / 'asset-sources.json').read_bytes())
        for a in owner['annotations']:
            metadata = json.loads((owner_root / a['metadata']).read_bytes()); definitions = [d for d in metadata['attachments'] if d['path']]
            if definitions: owners[base.key(a['source'])] = [dict(id=d['id'], path=d['path'], clips=visible_clips(d, metadata['sequences'])) for d in definitions]
    catalog = json.loads((library / 'construction-catalog.json').read_bytes()); catalog['owners'] = owners
    generated['construction-catalog.json'] = base.encode(catalog)
    generated['Assets/Licenses/warcraft-construction-sources.json'] = receipt_raw
    generated['Assets/Licenses/warcraft-construction.txt'] = (ROOT / 'samples/frostbound-realms/Assets/Licenses/warcraft-classic.txt').read_bytes()
    previous = output / 'construction-sources.json'; protected = set()
    if previous.exists():
        for f in json.loads(previous.read_bytes())['files']:
            raw = (output / f['path']).read_bytes(); assert len(raw) == f['bytes'] and base.digest(raw) == f['sha256'], 'Preserve modified construction import: ' + f['path']
            protected.add(f['path'])
    for relative, raw in generated.items():
        path = output / relative
        assert not path.exists() or path.read_bytes() == raw or relative in protected, 'Preserve untracked construction import: ' + relative
    result = dict(generator='scripts/import-frost-construction.py', importerSha256=base.digest(pathlib.Path(__file__).read_bytes()), libraryReceiptSha256=base.digest(receipt_raw), models=len(catalog['models']), ownerModels=len(owners), files=[dict(path=p, bytes=len(raw), sha256=base.digest(raw)) for p, raw in sorted(generated.items())])
    for relative, raw in generated.items():
        path = output / relative; path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.read_bytes() != raw: path.write_bytes(raw)
    previous.write_bytes(base.encode(result))
    print('PASS construction import:', len(catalog['models']), 'models,', len(owners), 'owner models,', len(generated), 'files')


if __name__ == '__main__': main()

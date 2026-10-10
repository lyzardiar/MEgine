#!/usr/bin/env python3
"""Author: MiYu. Check tracked Frostbound material GUIDs; fill only missing sidecars with --write."""
import argparse
import json
import pathlib
import subprocess
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
PREFIX = 'samples/frostbound-realms/Assets/'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Create missing sidecars; preserve all existing GUIDs')
    args = parser.parse_args()
    tracked = set(subprocess.check_output(['git', 'ls-files', '-z', '--', PREFIX], cwd=ROOT).decode('utf-8').split('\0'))
    materials = sorted(path for path in tracked if pathlib.PurePosixPath(path).suffix.lower() in ('.mmat', '.mat'))
    created, missing, untracked, errors, duplicate_guids, guids = [], [], [], [], [], {}
    for relative in materials:
        source = ROOT / relative
        sidecar = ROOT / (relative + '.meta')
        if not sidecar.exists():
            if not args.write:
                missing.append(relative + '.meta')
                continue
            asset_relative = relative[len('samples/frostbound-realms/'):]
            metadata = dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + asset_relative)), importer='material')
            with sidecar.open('x', encoding='utf-8', newline='\n') as output:
                output.write(json.dumps(metadata, separators=(',', ':')) + '\n')
            created.append(relative + '.meta')
        try:
            if source.is_symlink() or sidecar.is_symlink() or not source.is_file() or not sidecar.is_file():
                raise ValueError('asset and sidecar must be regular non-symlink files')
            metadata = json.loads(sidecar.read_text(encoding='utf-8'))
            guid = str(uuid.UUID(metadata['guid']))
            if uuid.UUID(guid).int == 0 or metadata.get('schemaVersion', 1) != 1 or (metadata.get('importer') or 'material') != 'material':
                raise ValueError('invalid material sidecar schema, importer or GUID')
            if guid in guids:
                duplicate_guids.append(dict(path=relative, sharedWith=guids[guid], guid=guid))
            else:
                guids[guid] = relative
        except (OSError, ValueError, KeyError, TypeError) as error:
            errors.append(dict(path=relative + '.meta', error=str(error)))
        if relative + '.meta' not in tracked:
            untracked.append(relative + '.meta')
    print(json.dumps(dict(author='MiYu', materials=len(materials), created=len(created), missing=len(missing), untracked=len(untracked), errors=errors, duplicateGuids=len(duplicate_guids), duplicateGuidExamples=duplicate_guids[:8], missingExamples=missing[:8], untrackedExamples=untracked[:8]), ensure_ascii=False))
    return 1 if missing or errors or duplicate_guids or (untracked and not args.write) else 0


if __name__ == '__main__':
    raise SystemExit(main())

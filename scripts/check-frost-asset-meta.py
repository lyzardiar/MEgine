#!/usr/bin/env python3
"""Author: MiYu. Verify that staged Frostbound assets include valid, portable metadata."""
import argparse
import json
import pathlib
import subprocess
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
PREFIX = 'samples/frostbound-realms/Assets/'
IMPORTERS = {suffix: kind for kind, suffixes in {
    'scene': ['mscene'], 'script': ['ts', 'js', 'mjs'], 'sprite-atlas': ['matlas'],
    'animation': ['manim'], 'animator-controller': ['mcontroller'], 'avatar-mask': ['mavatar'], 'timeline': ['mtimeline'],
    'audio': ['wav', 'ogg', 'mp3', 'flac'], 'material': ['mmat', 'mat', 'minst'], 'shader': ['mshader'],
    'prefab': ['prefab'], 'model': ['gltf', 'glb'], 'effekseer-effect': ['efkefc', 'efk'], 'effekseer-catalog': ['meffect'],
    'font': ['ttf', 'otf'], 'texture': ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tga', 'tif', 'tiff', 'hdr', 'exr'],
    'spine-atlas': ['atlas'], 'spine-binary': ['skel'], 'spine-json': ['json'],
}.items() for suffix in suffixes}


def asset_kind(relative):
    path = pathlib.PurePosixPath(relative)
    if any(part.startswith('.') for part in path.parts) or path.name.lower().endswith('.sprite.json'):
        return None
    return IMPORTERS.get(path.suffix.lower().lstrip('.'))


def validate_metadata(raw):
    if len(raw) > 1024 * 1024:
        raise ValueError('metadata exceeds 1 MiB')
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError('metadata must be a JSON object')
    if 'guid' in data:
        guid = data['guid']
    elif 'uuid' in data:
        guid = data['uuid']
    else:
        guid = data['mengine'].get('guid') if isinstance(data.get('mengine'), dict) else None
    if uuid.UUID(guid).int == 0 or type(data.get('schemaVersion', 1)) is not int or data.get('schemaVersion', 1) != 1:
        raise ValueError('invalid GUID or schema version')


def check(root, write=False):
    root = pathlib.Path(root).resolve()
    tracked = set(subprocess.check_output(['git', 'ls-files', '-z', '--', PREFIX], cwd=root).decode('utf-8').split('\0'))
    assets = sorted(path for path in tracked if path and asset_kind(path))
    report = dict(assets=len(assets), created=[], missing=[], untracked=[], errors=[], byImporter={})
    with subprocess.Popen(['git', 'cat-file', '--batch'], cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE) as git:
        try:
            for asset in assets:
                kind = asset_kind(asset)
                report['byImporter'][kind] = report['byImporter'].get(kind, 0) + 1
                relative = asset + '.meta'
                try:
                    if relative in tracked:
                        git.stdin.write((':' + relative + '\n').encode('utf-8')); git.stdin.flush()
                        header = git.stdout.readline().decode('utf-8').split()
                        if len(header) != 3 or header[1] != 'blob':
                            raise ValueError('metadata has no staged blob; resolve its Git index entries')
                        raw = git.stdout.read(int(header[2])); git.stdout.read(1)
                    else:
                        target = root / relative
                        if target.is_symlink() or any(parent.is_symlink() for parent in target.parents if parent != root):
                            raise ValueError('metadata path must not traverse symlinks')
                        if not target.exists() and write:
                            target.parent.mkdir(parents=True, exist_ok=True)
                            identity = 'mengine/frostbound-realms/' + asset[len('samples/frostbound-realms/'):]
                            data = dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, identity)), importer=kind)
                            with target.open('x', encoding='utf-8', newline='\n') as output:
                                output.write(json.dumps(data, separators=(',', ':')) + '\n')
                            report['created'].append(relative)
                        if not target.exists():
                            report['missing'].append(relative)
                            continue
                        raw = target.read_bytes()
                        report['untracked'].append(relative)
                    validate_metadata(raw)
                except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
                    report['errors'].append(dict(path=relative, error=str(error)))
        finally:
            git.stdin.close()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Fill absent sidecars; retain all existing GUIDs and importer settings. Stage created files before checking again.')
    args = parser.parse_args()
    report = check(ROOT, args.write)
    summary = {key: len(value) if isinstance(value, list) else value for key, value in report.items()}
    for key in ('missing', 'untracked', 'errors'):
        summary[key + 'Examples'] = report[key][:8]
    print(json.dumps(summary, ensure_ascii=False))
    return int(bool(report['missing'] or report['errors'] or (report['untracked'] and not args.write)))


if __name__ == '__main__':
    raise SystemExit(main())

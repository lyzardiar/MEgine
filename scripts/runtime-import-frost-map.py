"""Author: MiYu. Import any selected map file into a content-addressed runtime cache."""
import argparse
import errno
import hashlib
import importlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
VERSION = 1


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_cached(project, entry, source_sha):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', entry.get('id', '')):
        raise ValueError('Invalid cached map ID')
    package = (project / 'Assets/Maps' / entry['id']).resolve()
    if entry.get('sourceSha256') != source_sha:
        raise ValueError('Cached map source digest changed')
    for key in ['scene', 'script']:
        file = (project / entry[key]).resolve()
        file.relative_to(package)
        if not file.is_file():
            raise FileNotFoundError('Cached map file is missing: ' + entry[key])
    manifest = json.loads((package / 'manifest.json').read_bytes())
    original = (project / manifest['installedSource']).resolve()
    original.relative_to(package)
    if digest(original) != source_sha:
        raise ValueError('缓存中的原地图文件摘要不匹配')
    for record in manifest['assets']:
        file = (project / record['path']).resolve()
        file.relative_to(package)
        if not file.is_file() or digest(file) != record['sha256']:
            raise ValueError('地图缓存文件缺失或被修改：' + record['path'])
    return entry


def run(args):
    source, project, result = args.source.resolve(), args.project.resolve(), args.result.resolve()
    if source.suffix.lower() not in ('.w3m', '.w3x') or not source.is_file():
        raise ValueError('请选择已有的 .w3m 或 .w3x 文件')
    source_sha = digest(source)
    # Built-in and previously converted maps are content caches, never filename allowlists.
    catalog = project / 'Assets/Maps/catalog.json'
    if catalog.is_file():
        for entry in json.loads(catalog.read_bytes())['maps']:
            if entry.get('sourceSha256') == source_sha:
                return dict(validate_cached(project, entry, source_sha), cached=True)
    identifier = 'user-v' + str(VERSION) + '-' + source_sha
    destination = project / 'Assets/Maps' / identifier
    cache = destination / 'entry.json'
    if cache.is_file():
        return dict(validate_cached(project, json.loads(cache.read_bytes()), source_sha), cached=True)
    if destination.exists():
        raise ValueError('地图缓存不完整，请移走该目录后重试：' + str(destination))
    for name in ['war3.mpq', 'War3x.mpq', 'War3Patch.mpq', 'War3xLocal.mpq']:
        if not (args.game / name).is_file():
            raise FileNotFoundError('找不到魔兽资源档案 ' + str(args.game / name))
    for tool in ['node', 'dotnet']:
        if not shutil.which(tool):
            raise ValueError('首次地图转换需要 ' + tool + '，请安装后重试')
    # Each conversion builds in its own job directory; a failed job cannot publish a partial cache.
    work = result.parent
    exported = work / 'source-map'
    data = importlib.import_module('import-frost-original-map').export_map(source, exported)
    if data['source']['sha256'] != source_sha:
        raise ValueError('地图文件在读取期间发生变化，请重试')
    sampler = ROOT / 'tmp/warcraft-effects/sentinel-bin/MdxExport.dll'
    metadata = ROOT / 'tmp/warcraft-effects/node-metadata/NodeMetadata.dll'
    if not sampler.is_file() or not metadata.is_file():
        raise FileNotFoundError('地图转换工具未准备：运行 python scripts/prepare-frost-map-import.py')
    base = work / 'doodad-project'
    converted = work / 'converted'
    importlib.import_module('build-frost-original-doodads').build(exported, args.game, base, sampler, metadata)
    importlib.import_module('build-frost-original-units').build(exported, base, args.game, converted, sampler, metadata)
    importlib.import_module('install-frost-original-pathing').install(exported, converted)
    # Install into a staging project so the game sees either the whole map or no map.
    stage = work / 'stage'
    for name in ['Assets/Scenes/Main.mscene', 'Assets/Scripts/Main.js', 'project.json']:
        target = stage / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(project / name, target)
    subprocess.run(['node', str(ROOT / 'scripts/install-frost-map-package.mjs'), str(converted), identifier, source.stem, str(stage), '--runtime'], check=True)
    package = stage / 'Assets/Maps' / identifier
    entry = json.loads((package / 'entry.json').read_bytes())
    entry['cacheVersion'] = VERSION
    (package / 'entry.json').write_text(json.dumps(entry, ensure_ascii=False) + '\n', encoding='utf-8')
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Publish atomically; staging is copied only when the job folder is on another volume.
    try:
        os.rename(package, destination)
    except OSError as error:
        if error.errno != errno.EXDEV and getattr(error, 'winerror', None) != 17:
            raise
        staging = destination.parent / ('.import-' + uuid.uuid4().hex)
        shutil.copytree(package, staging)
        os.rename(staging, destination)
    return dict(validate_cached(project, entry, source_sha), cached=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--project', type=Path, required=True)
    parser.add_argument('--result', type=Path, required=True)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args()
    args.result.parent.mkdir(parents=True, exist_ok=True)
    try:
        receipt = run(args)
    except Exception as error:
        args.result.write_text(json.dumps(dict(error=str(error)), ensure_ascii=False), encoding='utf-8')
        raise
    args.result.write_text(json.dumps(receipt, ensure_ascii=False), encoding='utf-8')

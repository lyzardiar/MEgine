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
import time
import uuid
from warcraft_resource_cache import ResourceCache, encoded

ROOT = Path(__file__).resolve().parents[1]
VERSION = 2
ARCHIVES = ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq']


class ImportProgress:
    """Publish bounded, atomic snapshots; counts represent completed work, never elapsed time."""
    def __init__(self, path=None):
        self.path = Path(path) if path else None
        self.last_step, self.last_time = None, 0

    def report(self, step, message, completed=None, total=None):
        if self.path is None:
            return
        now = time.monotonic()
        if step == self.last_step and now - self.last_time < .2 and completed != total:
            return
        payload = dict(step=step, steps=8, message=message)
        if total:
            payload.update(completed=completed, total=total)
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
        os.replace(temporary, self.path)
        self.last_step, self.last_time = step, now


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_cached(project, entry, source_sha, progress=None):
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
    for index, record in enumerate(manifest['assets']):
        if progress:
            progress(index, len(manifest['assets']))
        file = (project / record['path']).resolve()
        if record.get('storage') == 'shared':
            if not re.fullmatch(r'Assets/WarcraftShared/v1/[0-9a-f]{64}\.[a-z0-9]+', record['path']):
                raise ValueError('Invalid shared resource path')
            file.relative_to((project / 'Assets/WarcraftShared/v1').resolve())
            if file.stem != record['sha256']:
                raise ValueError('Shared resource identity mismatch')
        else:
            file.relative_to(package)
        if not file.is_file() or digest(file) != record['sha256']:
            raise ValueError('地图缓存文件缺失或被修改：' + record['path'])
    if progress:
        progress(len(manifest['assets']), len(manifest['assets']))
    return entry


def import_environment(args):
    sampler = ROOT / 'tmp/warcraft-effects/sentinel-bin/MdxExport.dll'
    metadata = ROOT / 'tmp/warcraft-effects/node-metadata/NodeMetadata.dll'
    if not sampler.is_file() or not metadata.is_file():
        raise FileNotFoundError('地图转换工具未准备：运行 python scripts/prepare-frost-map-import.py')
    files = [ROOT / 'scripts' / name for name in ['warcraft_resource_cache.py', 'convert-warcraft-assets.py', 'convert-frost-classic-billboards.py', 'build-frost-original-doodads.py']]
    files += [sampler, metadata, sampler.with_name('Wc3ModelViewer.Core.dll'), metadata.with_name('Wc3ModelViewer.Core.dll')]
    cache = ResourceCache(getattr(args, 'cache_root', ROOT / 'tmp/warcraft-resource-cache/v1'), files)
    package_inputs = [ROOT / 'scripts' / name for name in ['runtime-import-frost-map.py', 'import-frost-original-map.py', 'import-frost-wisp-rules.py', 'warcraft_mpq.py', 'warcraft_map.py', 'warcraft_doodads.py', 'warcraft_terrain.py', 'warcraft_units.py', 'build-frost-original-terrain.py', 'build-frost-original-units.py', 'install-frost-original-pathing.py', 'frost-original-doodads-client.js', 'warcraft_camera.py', 'frost-original-camera-client.js', 'install-frost-map-package.mjs', 'frost-shared-map-assets.mjs', 'export-frost-map-preview.py']]
    package_inputs += [ROOT / 'asset-library/warcraft-iii' / pack / 'asset-sources.json' for pack in ['game-ready', 'remaining-ready']]
    package_inputs += [ROOT / 'samples/frostbound-realms' / name for name in ['game/warcraft-pathing.js', 'classic-cliff-sources.json', 'Assets/WarcraftIII/classic-cliff-catalog.json', 'Assets/WarcraftIII/Models/Terrain/ClassicCliffs.mpatch']]
    package_inputs.append(args.project.resolve() / 'Assets/Scenes/Main.mscene')
    archives = []
    for name in ARCHIVES:
        file = args.game / name
        if not file.is_file():
            raise FileNotFoundError('找不到魔兽资源档案 ' + str(file))
        archives.append(dict(name=name, sha256=cache.file_identity(file)))
    environment = dict(version=VERSION, recipe=cache.recipe, archives=archives, packageInputs=[dict(name=file.name, sha256=cache.file_identity(file)) for file in package_inputs])
    return cache, sampler, metadata, environment


def run(args):
    progress = ImportProgress(os.environ.get('MENGINE_CONTENT_PROGRESS'))
    progress.report(0, '检查地图与公共资源缓存')
    source, project, result = args.source.resolve(), args.project.resolve(), args.result.resolve()
    if source.suffix.lower() not in ('.w3m', '.w3x') or not source.is_file():
        raise ValueError('请选择已有的 .w3m 或 .w3x 文件')
    source_sha = digest(source)
    resource_cache, sampler, metadata, environment = import_environment(args)
    # Environment changes select a fresh map package; older packages remain intact.
    identity = hashlib.sha256(encoded(dict(source=source_sha, environment=environment))).hexdigest()
    identifier = 'user-v' + str(VERSION) + '-' + identity
    destination = project / 'Assets/Maps' / identifier
    cache = destination / 'entry.json'
    if cache.is_file():
        return dict(validate_cached(project, json.loads(cache.read_bytes()), source_sha, lambda done, total: progress.report(7, '校验缓存资源', done, total)), cached=True, resourceCache=dict(resource_cache.stats))
    if destination.exists():
        raise ValueError('地图缓存不完整，请移走该目录后重试：' + str(destination))
    for tool in ['node', 'dotnet']:
        if not shutil.which(tool):
            raise ValueError('首次地图转换需要 ' + tool + '，请安装后重试')
    # Each conversion builds in its own job directory; a failed job cannot publish a partial cache.
    work = result.parent
    for name in ['source-map', 'doodad-project', 'converted', 'stage']:
        if (work / name).exists() or (work / name).is_symlink():
            raise FileExistsError('Preserve existing job data: ' + str(work / name))
    exported = work / 'source-map'
    progress.report(1, '读取地图数据')
    data = importlib.import_module('import-frost-original-map').export_map(source, exported)
    if data['source']['sha256'] != source_sha:
        raise ValueError('地图文件在读取期间发生变化，请重试')
    base = work / 'doodad-project'
    converted = work / 'converted'
    progress.report(2, '构建地形')
    importlib.import_module('build-frost-original-doodads').build(exported, args.game, base, sampler, metadata, resource_cache=resource_cache, progress=lambda done, total: progress.report(3, '转换装饰物', done, total))
    progress.report(4, '转换单位')
    importlib.import_module('build-frost-original-units').build(exported, base, args.game, converted, sampler, metadata, resource_cache=resource_cache, progress=lambda done, total: progress.report(4, '转换单位', done, total))
    progress.report(5, '生成寻路数据')
    importlib.import_module('install-frost-original-pathing').install(exported, converted)
    if any(resource_cache.file_identity(args.game / item['name']) != item['sha256'] for item in environment['archives']):
        raise ValueError('魔兽资源档案在转换期间发生变化，请重试')
    # Install into a staging project so the game sees either the whole map or no map.
    stage = work / 'stage'
    progress.report(6, '安装地图与共享资源')
    stage.mkdir()
    for name in ['Assets/Scenes/Main.mscene', 'Assets/Scripts/Main.js', 'project.json']:
        target = stage / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(project / name, target)
    subprocess.run(['node', str(ROOT / 'scripts/install-frost-map-package.mjs'), str(converted), identifier, source.stem, str(stage), '--runtime', '--shared-root', str(project)], check=True)
    package = stage / 'Assets/Maps' / identifier
    entry = json.loads((package / 'entry.json').read_bytes())
    entry['cacheVersion'] = VERSION
    entry['environment'] = environment
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
    validated = validate_cached(project, entry, source_sha, lambda done, total: progress.report(7, '校验地图资源', done, total))
    # These directories belong to this successful job; published resources and receipts are retained.
    for directory in [exported, base, converted, stage]:
        if directory.is_symlink() or directory.resolve().parent != work:
            raise ValueError('Unexpected job cleanup path: ' + str(directory))
        shutil.rmtree(directory)
    return dict(validated, cached=False, resourceCache=dict(resource_cache.stats))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--project', type=Path, required=True)
    parser.add_argument('--result', type=Path, required=True)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--cache-root', type=Path, default=ROOT / 'tmp/warcraft-resource-cache/v1')
    args = parser.parse_args()
    args.result.parent.mkdir(parents=True, exist_ok=True)
    try:
        receipt = run(args)
    except Exception as error:
        args.result.write_text(json.dumps(dict(error=str(error)), ensure_ascii=False), encoding='utf-8')
        raise
    args.result.write_text(json.dumps(receipt, ensure_ascii=False), encoding='utf-8')

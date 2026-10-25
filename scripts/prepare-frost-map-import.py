"""Author: MiYu. Prepare and verify the local tools used by the game's map importer."""
from contextlib import contextmanager
import hashlib
import importlib
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]

OUTPUTS = ['sentinel-bin/MdxExport.dll', 'sentinel-bin/MdxExport.deps.json', 'sentinel-bin/MdxExport.runtimeconfig.json', 'sentinel-bin/Wc3ModelViewer.Core.dll',
           'node-metadata/NodeMetadata.dll', 'node-metadata/NodeMetadata.deps.json', 'node-metadata/NodeMetadata.runtimeconfig.json', 'node-metadata/Wc3ModelViewer.Core.dll', 'blast.exe']


def fingerprint():
    paths = ['scripts/prepare-frost-map-import.py', 'scripts/convert-warcraft-assets.py', 'scripts/build-warcraft-blast.ps1', 'scripts/warcraft-compression/blast-cli.c', 'third_party/blast/blast.c', 'third_party/blast/blast.h']
    for folder in ['warcraft-assets', 'warcraft-node-metadata']:
        paths += [p.relative_to(ROOT).as_posix() for p in sorted((ROOT / 'scripts' / folder).iterdir()) if p.suffix in ('.cs', '.csproj')]
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in paths}


def ready(directory, sources):
    try:
        receipt = json.loads((directory / 'ready.json').read_bytes())
        return receipt['sources'] == sources and set(receipt['outputs']) == set(OUTPUTS) and all(hashlib.sha256((directory / p).read_bytes()).hexdigest() == receipt['outputs'][p] for p in OUTPUTS)
    except (OSError, ValueError, KeyError, TypeError):
        return False


def require_runtime():
    for module, package in [('numpy', 'NumPy'), ('PIL', 'Pillow')]:
        try:
            importlib.import_module(module)
        except ImportError as error:
            raise RuntimeError(f'地图导入缺少 {package}：使用当前 Python 执行 "{sys.executable}" -m pip install -r "{ROOT / "scripts/warcraft-assets/requirements.txt"}"') from error
    if not shutil.which('node'):
        raise RuntimeError('地图导入需要 Node.js，请安装并确保 node 在编辑器的 PATH 中')
    if not shutil.which('dotnet'):
        raise RuntimeError('地图导入需要 .NET 10；首次自动构建工具需要 .NET 10 SDK，请安装后重试')
    run = subprocess.run(['dotnet', '--list-runtimes'], capture_output=True, text=True, check=True)
    if not any(line.startswith('Microsoft.NETCore.App 10.') for line in run.stdout.splitlines()):
        raise RuntimeError('地图导入需要 .NET 10 运行时；首次准备请安装 .NET 10 SDK')


@contextmanager
def preparation_lock(directory, timeout=600):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / 'prepare.lock').open('a+b') as stream:
        if stream.tell() == 0:
            stream.write(b'\0'); stream.flush()
        deadline = time.monotonic() + timeout
        while True:
            stream.seek(0)
            try:
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise TimeoutError('等待地图导入工具准备超时，请查看其他导入作业日志')
                time.sleep(.2)
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == 'nt':
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def build(destination):
    sdks = subprocess.run(['dotnet', '--list-sdks'], capture_output=True, text=True, check=True).stdout
    if not any(line.startswith('10.') for line in sdks.splitlines()):
        raise RuntimeError('首次准备地图转换工具需要 .NET 10 SDK（仅安装运行时不够）')
    powershell = shutil.which('pwsh') or shutil.which('powershell')
    if os.name != 'nt' or not powershell:
        raise RuntimeError('自动准备地图解压工具需要 Windows PowerShell 和 Microsoft C++ Build Tools')
    subprocess.run([powershell, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(ROOT / 'scripts/build-warcraft-blast.ps1'), '-Output', str(destination / 'blast.exe')], check=True)
    converter = importlib.import_module('convert-warcraft-assets')
    sampler, _, _ = converter.sampler()
    (destination / 'sentinel-bin').mkdir()
    for source in sampler.parent.iterdir():
        if source.is_file():
            shutil.copyfile(source, destination / 'sentinel-bin' / source.name)
    core = ROOT / 'tmp/warcraft-converter' / converter.COMMIT / 'upstream/src/Wc3ModelViewer.Core'
    subprocess.run(['dotnet', 'build', str(ROOT / 'scripts/warcraft-node-metadata/NodeMetadata.csproj'), '-p:Wc3Core=' + str(core), '-o', str(destination / 'node-metadata'), '--nologo', '--verbosity', 'quiet'], check=True)


def ensure_tools(report=None):
    require_runtime()
    sources = fingerprint()
    cache = ROOT / 'tmp/warcraft-map-import'
    identity = hashlib.sha256(json.dumps(sources, sort_keys=True).encode()).hexdigest()
    directory = cache / identity
    with preparation_lock(cache):
        if not ready(directory, sources):
            if report:
                report('首次导入或工具更新：正在准备地图转换与解压工具')
            with tempfile.TemporaryDirectory(prefix='build-', dir=cache) as temporary:
                staging = Path(temporary)
                build(staging)
                outputs = {p: hashlib.sha256((staging / p).read_bytes()).hexdigest() for p in OUTPUTS}
                # A receipt is published only after every tool and its dependencies exist.
                (staging / 'ready.json').write_text(json.dumps(dict(sources=sources, outputs=outputs)), encoding='utf-8')
                if directory.exists():
                    directory.rename(cache / ('invalid-' + identity + '-' + str(time.time_ns())))
                staging.rename(directory)
                if not ready(directory, sources):
                    raise RuntimeError('地图转换工具校验失败，请查看当前作业 converter.log')
    blast = Path(os.environ.get('MENGINE_BLAST_EXECUTABLE', directory / 'blast.exe')).resolve()
    if not blast.is_file():
        raise FileNotFoundError('找不到指定的地图解压工具：' + str(blast))
    os.environ['MENGINE_BLAST_EXECUTABLE'] = str(blast)
    return directory / 'sentinel-bin/MdxExport.dll', directory / 'node-metadata/NodeMetadata.dll', blast


if __name__ == '__main__':
    ensure_tools(print)
    print('Warcraft map import tools are ready.')

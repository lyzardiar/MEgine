"""Author: MiYu. Prepare the hash-pinned FBX converter without modifying any sample."""
import hashlib
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://registry.npmjs.org/fbx2gltf/-/fbx2gltf-0.9.7-p1.tgz'
SHA256 = '9ff30dc5839155aead31ddadce99884773f8bf81678f3ac9a97ca24f8d58d64c'

def main():
    cache = ROOT / 'tmp/tools/unity-import'
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / 'fbx2gltf-0.9.7-p1.tgz'
    if not archive.exists():
        temporary = archive.with_suffix('.part')
        urllib.request.urlretrieve(URL, temporary)
        temporary.replace(archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise ValueError('FBX2glTF archive SHA-256 mismatch')
    with tarfile.open(archive) as package:
        members = [m for m in package.getmembers() if m.name.startswith('package/bin/Windows_NT/') and m.isfile()]
        package.extractall(cache, members=members, filter='data')
        license_bytes = package.extractfile('package/LICENSE').read()
    executable = cache / 'package/bin/Windows_NT/FBX2glTF.exe'
    (executable.parent / 'LICENSE.txt').write_bytes(license_bytes)
    provenance = {'url': URL, 'archive_sha256': SHA256, 'executable_sha256': hashlib.sha256(executable.read_bytes()).hexdigest()}
    (executable.parent / 'provenance.json').write_text(json.dumps(provenance, indent=2), encoding='utf-8')
    print(executable)

if __name__ == '__main__':
    main()

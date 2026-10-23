"""Author: MiYu. Immutable MPQ member and pure conversion caches shared by map imports."""
from collections import Counter
import hashlib
import io
import json
import os
from pathlib import Path, PureWindowsPath
import tempfile
from PIL import Image, __version__ as pillow_version
import numpy as np
import warcraft_mpq
from warcraft_mpq import read_archive


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def publish(file, raw):
    """Publish a complete immutable value; concurrent writers must agree on its bytes."""
    file.parent.mkdir(parents=True, exist_ok=True)
    if file.exists():
        if file.read_bytes() != raw:
            raise ValueError('Shared cache content conflict: ' + str(file))
        return
    handle, temporary = tempfile.mkstemp(prefix='.publish-', dir=file.parent)
    try:
        with os.fdopen(handle, 'wb') as stream:
            stream.write(raw)
        try:
            os.link(temporary, file)
        except FileExistsError:
            if file.read_bytes() != raw:
                raise ValueError('Concurrent shared cache content conflict: ' + str(file))
    finally:
        Path(temporary).unlink(missing_ok=True)


class ResourceCache:
    def __init__(self, root, tools=()):
        self.root = Path(root).resolve()
        self.stats = Counter()
        self._file_ids = {}
        self.reader = digest(encoded([digest(Path(warcraft_mpq.__file__).read_bytes()), digest(Path(warcraft_mpq.mpyq.__file__).read_bytes())]))
        self.recipe = digest(encoded(dict(version=1, reader=self.reader, tools=[self.file_identity(Path(tool)) for tool in tools], pillow=pillow_version, numpy=np.__version__)))

    def file_identity(self, file):
        file = file.resolve()
        before = file.stat()
        signature = [str(file), before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns]
        key = digest(encoded(signature))
        if key in self._file_ids:
            return self._file_ids[key]
        record = self.root / 'files' / (key + '.json')
        if record.exists():
            entry = json.loads(record.read_bytes())
            if entry.get('signature') != signature:
                raise ValueError('Source fingerprint metadata mismatch: ' + str(record))
            value = entry['sha256']
        else:
            result = hashlib.sha256()
            with file.open('rb') as stream:
                for block in iter(lambda: stream.read(1024*1024), b''):
                    result.update(block)
            after = file.stat()
            if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                raise ValueError('Source changed while fingerprinting: ' + str(file))
            value = result.hexdigest()
            publish(record, encoded(dict(signature=signature, sha256=value)))
            self.stats['filesHashed'] += 1
        if len(value) != 64 or any(c not in '0123456789abcdef' for c in value):
            raise ValueError('Invalid source fingerprint: ' + str(record))
        self._file_ids[key] = value
        return value

    def _blob(self, sha):
        if not isinstance(sha, str) or len(sha) != 64 or any(c not in '0123456789abcdef' for c in sha):
            raise ValueError('Invalid shared blob identity')
        file = self.root / 'blobs' / sha[:2] / sha
        if not file.is_file():
            raise ValueError('Shared cache blob is missing: ' + str(file))
        raw = file.read_bytes()
        if digest(raw) != sha:
            raise ValueError('Shared cache blob was modified: ' + str(file))
        return raw

    def _store(self, raw):
        sha = digest(raw)
        publish(self.root / 'blobs' / sha[:2] / sha, raw)
        return sha

    def member(self, archive, relative, archive_sha):
        path = PureWindowsPath(relative)
        if path.is_absolute() or '..' in path.parts or ':' in relative:
            raise ValueError('Unsafe archive member: ' + relative)
        name = path.as_posix().lower()
        record = self.root / 'members' / (digest(encoded([self.reader, archive_sha, name])) + '.json')
        if record.exists():
            entry = json.loads(record.read_bytes())
            if entry.get('missing'):
                self.stats['missingMemberHits'] += 1
                raise FileNotFoundError(relative)
            raw = self._blob(entry['sha256'])
            self.stats['memberHits'] += 1
            self.stats['memberHits:' + archive_sha] += 1
            self.stats['memberHitBytes'] += len(raw)
            return raw
        try:
            raw = read_archive(archive, str(path))
        except FileNotFoundError:
            publish(record, encoded(dict(missing=True)))
            self.stats['missingMemberProbes'] += 1
            raise
        publish(record, encoded(dict(archiveSha256=archive_sha, member=name, sha256=self._store(raw))))
        self.stats['memberExtractions'] += 1
        self.stats['memberExtractions:' + archive_sha] += 1
        self.stats['memberExtractedBytes'] += len(raw)
        return raw

    def produce(self, kind, inputs, build):
        record = self.root / 'derived' / (digest(encoded([self.recipe, kind, inputs])) + '.json')
        if record.exists():
            raw = self._blob(json.loads(record.read_bytes())['sha256'])
            self.stats['derivedHits:' + kind] += 1
            return raw
        raw = build()
        publish(record, encoded(dict(kind=kind, inputs=inputs, recipe=self.recipe, sha256=self._store(raw))))
        self.stats['derivedBuilds:' + kind] += 1
        return raw

    def texture_bytes(self, raw, decoder):
        def build():
            output = io.BytesIO()
            decoder(raw).save(output, format='PNG')
            return output.getvalue()
        return self.produce('texture-png', [digest(raw)], build)

    def texture(self, raw, decoder):
        with Image.open(io.BytesIO(self.texture_bytes(raw, decoder))) as image:
            return image.copy()

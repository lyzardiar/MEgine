"""Author: MiYu. Build an isolated map with independent custom defense upgrades."""
import argparse
import importlib.util
import io
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('live_fixture', pathlib.Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


def modification(field, value, marker, upgrade):
    kind = 3 if isinstance(value, str) else 0
    result = field.encode('ascii') + struct.pack('<I', kind)
    if upgrade:
        result += struct.pack('<II', 0, 0)
    result += value.encode('utf-8') + b'\0' if kind == 3 else struct.pack('<i', value)
    return result + marker


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT/'tmp/docs-artifacts/war3/fortified/custom-fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only game installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = b'function config takes nothing returns nothing\nendfunction\nfunction main takes nothing returns nothing\nendfunction\n'
    upgrades = [(b'R0F1', [('glvl', 2), ('gba1', 1), ('gmo1', 1)]), (b'R0F2', [('glvl', 1), ('gba1', 1), ('gmo1', 0)])]
    files['war3map.w3q'] = struct.pack('<III', 2, 0, len(upgrades)) + b''.join(b'Rorb' + custom + struct.pack('<I', len(changes)) + b''.join(modification(field, value, custom, True) for field, value in changes) for custom, changes in upgrades)
    files['war3map.w3u'] = struct.pack('<II', 2, 1) + b'otrb' + bytes(4) + struct.pack('<I', 1) + modification('upgr', 'R0F1,R0F2', b'otrb', False) + struct.pack('<I', 0)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()

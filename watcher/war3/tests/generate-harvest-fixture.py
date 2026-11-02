"""Author: MiYu. Copy source geometry into an isolated gold economy consumer map."""
import argparse
import importlib.util
import io
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('live_fixture', pathlib.Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT/'tmp/docs-artifacts/war3/economy/fixture.w3m')
    parser.add_argument('--tree-targets', choices=['partial', 'invu', 'invulnerable'])
    parser.add_argument('--special-silence', action='store_true')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only game installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = b'function config takes nothing returns nothing\nendfunction\nfunction main takes nothing returns nothing\nendfunction\n'
    if args.tree_targets and args.special_silence:
        raise ValueError('Choose one ability override per fixture')
    if args.special_silence:
        files['war3map.w3a'] = struct.pack('<II', 2, 1) + b'ANsi' + bytes(4) + struct.pack('<I', 1) + b'Nsi1' + struct.pack('<IIIi', 0, 1, 0, 4) + b'ANsi' + struct.pack('<I', 0)
    if args.tree_targets:
        targets = {'partial': 'tree,notinvu', 'invu': 'tree,invu', 'invulnerable': 'tree,invulnerable'}[args.tree_targets]
        files['war3map.w3a'] = struct.pack('<II', 2, 1) + b'Ahar' + bytes(4) + struct.pack('<I', 1) + b'atar' + struct.pack('<III', 3, 1, 0) + targets.encode('ascii') + b'\0Ahar' + struct.pack('<I', 0)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()

"""Author: MiYu. Isolated source geometry and a full-miss curse boundary for deferred caster verification."""
import argparse
import importlib.util
import io
import struct
from pathlib import Path

spec = importlib.util.spec_from_file_location('live_fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT = Path(__file__).resolve().parents[3]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/caster-spells/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = b'function config takes nothing returns nothing\nendfunction\nfunction main takes nothing returns nothing\nendfunction\n'
    curse = b'AcrsA0CS'+struct.pack('<I', 1)+b'Crs '+struct.pack('<III f', 2, 1, 1, 1.)+b'A0CS'
    def targets(base, custom, value):
        return base+custom+struct.pack('<I', 1)+b'atar'+struct.pack('<III', 3, 1, 0)+value+b'\0'+custom
    chain = b'AOclA0CL'+struct.pack('<I',2)+b'atar'+struct.pack('<III',3,1,0)+b'air,ground,friend,neutral\0A0CL'+b'Ocl1'+struct.pack('<IIIf',2,1,1,0.)+b'A0CL'
    files['war3map.w3a'] = struct.pack('<III', 2, 0, 4)+curse+targets(b'Acrs',b'A0CE',b'air,ground,enemies,neutral')+targets(b'Ainf',b'A0CF',b'air,ground,allies,neutral')+chain
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()

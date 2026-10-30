"""Author: MiYu. Custom Aste item parameters for the staged resource-steal consumer."""
import argparse
import importlib.util
import io
import struct
from pathlib import Path

spec = importlib.util.spec_from_file_location('spell_fixture', Path(__file__).with_name('generate-spell-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=fixture.ROOT/'tmp/docs-artifacts/war3/steal/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()): raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = fixture.SCRIPT.encode('utf-8')
    abilities, items = [], []
    for ability, item, values in [(b'A0S1',b'I0S1',(50.,40.,1,1,1)),(b'A0S2',b'I0S2',(.5,.25,0,0,1)),(b'A0S3',b'I0S3',(30.,20.,1,1,0))]:
        changes = []
        for index, value in enumerate(values,1):
            kind = 2 if index<=2 else 0
            changes.append(('Udp'+str(index)).encode('ascii')+struct.pack('<III',kind,1,index)+struct.pack('<f' if kind==2 else '<i',value)+ability)
        abilities.append(b'Aste'+ability+struct.pack('<I',len(changes))+b''.join(changes))
        items.append(b'woms'+item+struct.pack('<I',1)+b'iabi'+struct.pack('<I',3)+ability+b'\0'+item)
    files['war3map.w3a'] = struct.pack('<III',2,0,len(abilities))+b''.join(abilities)
    files['war3map.w3t'] = struct.pack('<III',2,0,len(items))+b''.join(items)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))

if __name__ == '__main__': main()

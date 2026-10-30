"""Author: MiYu. Prepare a map whose config consumes the initial random stream."""
import argparse
import importlib.util
import io
from pathlib import Path

spec = importlib.util.spec_from_file_location('channel_fixture', Path(__file__).with_name('generate-channel-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root', type=Path, required=True)
parser.add_argument('--output', type=Path, default=fixture.fixture.ROOT/'tmp/docs-artifacts/war3/map-seed/fixture.w3m')
args = parser.parse_args()
if args.output.resolve().is_relative_to(args.data_root.resolve()):
    raise ValueError('Fixture output must stay outside the read-only installation')
original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
offset = original.index(b'MPQ\x1a')
helper = fixture.fixture.fixture
archive = helper.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
names = helper.read_archive(archive, '(listfile)').decode('ascii').splitlines()
files = {name: helper.read_archive(archive, name) for name in names if name and name != '(listfile)'}
files['war3map.j'] = b'globals\ninteger seed_probe = 0\nendglobals\nfunction config takes nothing returns nothing\nset seed_probe = GetRandomInt(0, 1000000)\nendfunction\nfunction main takes nothing returns nothing\nendfunction\n'
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_bytes(original[:offset]+helper.build_archive(files))
print('fixture='+str(args.output.resolve()))

"""Author: MiYu. Local source-terrain fixture for live unsummon ability and original AI consumers."""
import argparse
import importlib.util
import io
from pathlib import Path

spec = importlib.util.spec_from_file_location('live_fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = '''globals
unit caster=null
unit building=null
unit enemy_building=null
endglobals
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    set caster=CreateUnit(Player(0),'uaco',-2048,0,0)
    set building=CreateUnit(Player(0),'uzig',512,0,0)
    set enemy_building=CreateUnit(Player(1),'uzig',1536,0,0)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_GOLD,1000)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_LUMBER,1000)
    call StartCampaignAI(Player(0),"unsummon.ai")
endfunction
'''
STRATEGY = '''function main takes nothing returns nothing
    call InitAI()
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/unsummon/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    files['unsummon.ai'] = STRATEGY.encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()

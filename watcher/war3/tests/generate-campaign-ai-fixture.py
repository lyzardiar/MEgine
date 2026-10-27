"""Author: MiYu. Isolated source-terrain campaign setup uses the original common.ai CampaignAI entry point."""
import argparse
import importlib.util
import io
from pathlib import Path

spec = importlib.util.spec_from_file_location('live_fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = '''globals
unit hall=null
unit worker=null
destructable tree=null
endglobals
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    local integer i=0
    local unit u=null
    set hall=CreateUnit(Player(0),'htow',-512,0,0)
    set u=CreateUnit(Player(0),'hbar',-768,-512,0)
    set u=CreateUnit(Player(0),'hhou',-1024,0,0)
    set u=CreateUnit(Player(15),'ngol',0,512,0)
    set tree=CreateDestructable('LTlt',0,-256,0,1,0)
    loop
        exitwhen i==8
        set u=CreateUnit(Player(0),'hpea',I2R(-128+i*32),-256,0)
        call SetUnitPathing(u,false)
        if i==0 then
            set worker=u
        endif
        set i=i+1
    endloop
    set i=0
    loop
        exitwhen i==4
        set u=CreateUnit(Player(0),'hfoo',I2R(-512+i*48),-768,0)
        call SetUnitPathing(u,false)
        set i=i+1
    endloop
    set u=CreateUnit(Player(1),'hfoo',2500,0,0)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_GOLD,2000)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_LUMBER,2000)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_FOOD_CAP,100)
    call StartCampaignAI(Player(0),"campaign.ai")
endfunction
'''
STRATEGY = '''globals
boolean campaign_opened=false
endglobals
function main takes nothing returns nothing
    call CampaignAI('hhou',null)
    call SetBuildUnit(8,'hpea')
    call SetBuildUnit(6,'hfoo')
    set campaign_opened=true
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/campaign-ai/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    files['campaign.ai'] = STRATEGY.encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()

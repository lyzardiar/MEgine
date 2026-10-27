"""Author: MiYu. Read-only source map copied into root tmp for isolated AI controls and real paid guard recruitment."""
import argparse
import importlib.util
import io
from pathlib import Path

spec = importlib.util.spec_from_file_location('live_fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = '''globals
unit first=null
unit free0=null
unit second=null
unit free1=null
endglobals
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    set first=CreateUnit(Player(0),'hfoo',-512,0,0)
    set free0=CreateUnit(Player(0),'hfoo',-384,0,0)
    set second=CreateUnit(Player(1),'hfoo',512,0,0)
    set free1=CreateUnit(Player(1),'hfoo',640,0,0)
    call StartMeleeAI(Player(0),"control.ai")
    call StartMeleeAI(Player(1),"control.ai")
endfunction
'''
STRATEGY = '''globals
integer pulses=0
endglobals
function Pulse takes nothing returns nothing
    loop
        call Sleep(0.125)
        set pulses=pulses+1
    endloop
endfunction
function main takes nothing returns nothing
    call AddGuardPost('hfoo',I2R(GetAiPlayer()*1024-512),0)
    call FillGuardPosts()
    call StartThread(function Pulse)
endfunction
'''

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'tmp/docs-artifacts/war3/ai-control/fixture.w3m')
    args=parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture must stay outside the read-only installation')
    original=(args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset=original.index(b'MPQ\x1a')
    archive=fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]),listfile=False)
    names=fixture.read_archive(archive,'(listfile)').decode('ascii').splitlines()
    files={name:fixture.read_archive(archive,name) for name in names if name and name!='(listfile)'}
    files['war3map.j']=SCRIPT.encode('utf-8')
    files['control.ai']=STRATEGY.encode('utf-8')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))

if __name__=='__main__':
    main()

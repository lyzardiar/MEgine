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
    files['war3map.j'] = b'''globals
unit interruptedTarget=null
destructable interruptedTree=null
item interruptedItem=null
integer interruptCount=0
integer unloadOrderCount=0
integer entangleReissued=0
boolean entangleReissueAccepted=false
unit entangleMineTarget=null
real interruptX=0
endglobals
function ReissueEntangle takes nothing returns nothing
    if entangleReissued==0 then
        set entangleReissued=1
        set entangleReissueAccepted=IssueTargetOrderById(GetTriggerUnit(),852147,entangleMineTarget)
    endif
endfunction
function InstallEntangleReissue takes unit tree, unit mine returns nothing
    local trigger t=CreateTrigger()
    set entangleMineTarget=mine
    call TriggerRegisterUnitEvent(t,tree,EVENT_UNIT_ISSUED_TARGET_ORDER)
    call TriggerAddAction(t,function ReissueEntangle)
endfunction
function ObserveUnloadOrder takes nothing returns nothing
    set unloadOrderCount=unloadOrderCount+1
endfunction
function InstallUnloadObserver takes unit carrier returns nothing
    local trigger t=CreateTrigger()
    call TriggerRegisterUnitEvent(t,carrier,EVENT_UNIT_ISSUED_TARGET_ORDER)
    call TriggerRegisterUnitEvent(t,carrier,EVENT_UNIT_ISSUED_ORDER)
    call TriggerAddAction(t,function ObserveUnloadOrder)
endfunction
function InterruptRemoveTarget takes nothing returns nothing
    set interruptCount=interruptCount+1
    call RemoveUnit(interruptedTarget)
endfunction
function InstallInterruptRemove takes unit caster, unit target returns nothing
    local trigger t=CreateTrigger()
    set interruptedTarget=target
    call TriggerRegisterUnitEvent(t,caster,EVENT_UNIT_SPELL_ENDCAST)
    call TriggerAddAction(t,function InterruptRemoveTarget)
endfunction
function InterruptRemoveTree takes nothing returns nothing
    set interruptCount=interruptCount+1
    call RemoveDestructable(interruptedTree)
endfunction
function InstallInterruptRemoveTree takes unit caster, destructable target returns nothing
    local trigger t=CreateTrigger()
    set interruptedTree=target
    call TriggerRegisterUnitEvent(t,caster,EVENT_UNIT_SPELL_ENDCAST)
    call TriggerAddAction(t,function InterruptRemoveTree)
endfunction
function InterruptMoveTarget takes nothing returns nothing
    set interruptCount=interruptCount+1
    call SetUnitX(interruptedTarget,interruptX)
endfunction
function InstallInterruptMove takes unit caster, unit target, real x returns nothing
    local trigger t=CreateTrigger()
    set interruptedTarget=target
    set interruptX=x
    call TriggerRegisterUnitEvent(t,caster,EVENT_UNIT_SPELL_ENDCAST)
    call TriggerAddAction(t,function InterruptMoveTarget)
endfunction
function InterruptNewOrder takes nothing returns nothing
    set interruptCount=interruptCount+1
    call IssuePointOrder(interruptedTarget,"move",interruptX,GetUnitY(interruptedTarget))
endfunction
function InstallInterruptOrder takes unit caster, real x returns nothing
    local trigger t=CreateTrigger()
    set interruptedTarget=caster
    set interruptX=x
    call TriggerRegisterUnitEvent(t,caster,EVENT_UNIT_SPELL_ENDCAST)
    call TriggerAddAction(t,function InterruptNewOrder)
endfunction
function InterruptSpendGold takes nothing returns nothing
    set interruptCount=interruptCount+1
    call SetPlayerState(GetOwningPlayer(interruptedTarget),PLAYER_STATE_RESOURCE_GOLD,0)
endfunction
function InstallInterruptSpend takes unit caster returns nothing
    local trigger t=CreateTrigger()
    set interruptedTarget=caster
    call TriggerRegisterUnitEvent(t,caster,EVENT_UNIT_SPELL_ENDCAST)
    call TriggerAddAction(t,function InterruptSpendGold)
endfunction
function InterruptStop takes nothing returns nothing
    set interruptCount=interruptCount+1
    call IssueImmediateOrder(interruptedTarget,"stop")
endfunction
function InstallInterruptStop takes unit caster returns nothing
    local trigger t=CreateTrigger()
    set interruptedTarget=caster
    call TriggerRegisterUnitEvent(t,caster,EVENT_UNIT_SPELL_ENDCAST)
    call TriggerAddAction(t,function InterruptStop)
endfunction
function InterruptPause takes nothing returns nothing
    set interruptCount=interruptCount+1
    call PauseUnit(interruptedTarget,true)
endfunction
function InstallInterruptPause takes unit caster returns nothing
    local trigger t=CreateTrigger()
    set interruptedTarget=caster
    call TriggerRegisterUnitEvent(t,caster,EVENT_UNIT_SPELL_ENDCAST)
    call TriggerAddAction(t,function InterruptPause)
endfunction
function InterruptRemoveItem takes nothing returns nothing
    set interruptCount=interruptCount+1
    call RemoveItem(interruptedItem)
endfunction
function InstallInterruptRemoveItem takes unit caster, item target returns nothing
    local trigger t=CreateTrigger()
    set interruptedItem=target
    call TriggerRegisterUnitEvent(t,caster,EVENT_UNIT_SPELL_ENDCAST)
    call TriggerAddAction(t,function InterruptRemoveItem)
endfunction
function InterruptMoveItem takes nothing returns nothing
    set interruptCount=interruptCount+1
    call SetItemPosition(interruptedItem,interruptX,GetItemY(interruptedItem))
endfunction
function InstallInterruptItem takes unit caster, item target, real x returns nothing
    local trigger t=CreateTrigger()
    set interruptedItem=target
    set interruptX=x
    call TriggerRegisterUnitEvent(t,caster,EVENT_UNIT_SPELL_ENDCAST)
    call TriggerAddAction(t,function InterruptMoveItem)
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
endfunction
'''
    curse = b'AcrsA0CS'+struct.pack('<I', 1)+b'Crs1'+struct.pack('<III f', 2, 1, 1, 1.)+b'A0CS'
    def targets(base, custom, value):
        return base+custom+struct.pack('<I', 1)+b'atar'+struct.pack('<III', 3, 1, 0)+value+b'\0'+custom
    chain = b'AOclA0CL'+struct.pack('<I',2)+b'atar'+struct.pack('<III',3,1,0)+b'air,ground,friend,neutral\0A0CL'+b'Ocl1'+struct.pack('<IIIf',2,1,1,0.)+b'A0CL'
    roar = b'AroaA0R0'+struct.pack('<I',4)+b'Roa1'+struct.pack('<IIIf',2,1,1,0.)+b'A0R0'+b'atar'+struct.pack('<III',3,1,0)+b'none\0A0R0'+b'abuf'+struct.pack('<III',3,1,0)+b'_\0A0R0'+b'acdn'+struct.pack('<IIIf',2,1,0,5.)+b'A0R0'
    files['war3map.w3a'] = struct.pack('<III', 2, 0, 6)+curse+targets(b'Acrs',b'A0CE',b'air,ground,enemies,neutral')+targets(b'Ainf',b'A0CF',b'air,ground,allies,neutral')+chain+roar+targets(b'Aclf',b'A0CD',b'air,ground,enemy')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()

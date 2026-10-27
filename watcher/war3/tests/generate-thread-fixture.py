"""Author: MiYu. Isolated source geometry for waiting map main, actual trigger contexts and timer continuations."""
import argparse
import importlib.util
import io
from pathlib import Path

spec = importlib.util.spec_from_file_location('live_fixture', Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = '''native ThreadLease takes code action returns nothing
globals
integer main_before=0
integer main_after=0
integer event_done=0
integer timer_done=0
integer serial_trace=0
integer parallel_trace=0
integer execute_returned=0
integer join_returned=0
integer after_cancel=0
unit first=null
unit second=null
trigger serial_trigger=null
trigger parallel_trigger=null
endglobals
function EventAction takes nothing returns nothing
    local unit u=GetTriggerUnit()
    local player p=GetTriggerPlayer()
    local trigger t=GetTriggeringTrigger()
    local eventid e=GetTriggerEventId()
    call TriggerSleepAction(0.125)
    if GetTriggerUnit()!=u or GetTriggerPlayer()!=p or GetTriggeringTrigger()!=t or GetTriggerEventId()!=e then
        call ExecuteFunc("ThreadFailure_event_context")
    endif
    set event_done=event_done+1
endfunction
function TimerAction takes nothing returns nothing
    local timer t=GetExpiredTimer()
    call TriggerSleepAction(0.125)
    if GetExpiredTimer()!=t then
        call ExecuteFunc("ThreadFailure_timer_context")
    endif
    set timer_done=timer_done+1
    call DestroyTimer(t)
endfunction
function TimerBegin takes nothing returns nothing
    call TimerStart(CreateTimer(),0.03125,false,function TimerAction)
endfunction
function SerialFirst takes nothing returns nothing
    set serial_trace=serial_trace*10+1
    call TriggerSleepAction(0.125)
    set serial_trace=serial_trace*10+2
endfunction
function SerialSecond takes nothing returns nothing
    set serial_trace=serial_trace*10+3
endfunction
function ParallelFirst takes nothing returns nothing
    set parallel_trace=parallel_trace*10+1
    call TriggerSleepAction(0.125)
    set parallel_trace=parallel_trace*10+2
endfunction
function ParallelSecond takes nothing returns nothing
    set parallel_trace=parallel_trace*10+3
endfunction
function RunSerial takes nothing returns nothing
    call TriggerExecute(serial_trigger)
    set execute_returned=1
endfunction
function RunParallel takes nothing returns nothing
    call TriggerExecute(parallel_trigger)
endfunction
function RunJoin takes nothing returns nothing
    set serial_trace=0
    call TriggerExecuteWait(serial_trigger)
    set join_returned=1
endfunction
function LeaseDelay takes nothing returns nothing
    call TriggerSleepAction(10.0)
endfunction
function HoldLease takes nothing returns nothing
    call ThreadLease(function LeaseDelay)
    set after_cancel=1
endfunction
function Setup takes nothing returns nothing
    local trigger t=CreateTrigger()
    set first=CreateUnit(Player(0),'hfoo',0,0,0)
    set second=CreateUnit(Player(1),'hfoo',100,0,0)
    call SetUnitPathing(first,false)
    call SetUnitPathing(second,false)
    call TriggerRegisterUnitEvent(t,first,EVENT_UNIT_SELECTED)
    call TriggerRegisterUnitEvent(t,second,EVENT_UNIT_SELECTED)
    call TriggerAddAction(t,function EventAction)
    set serial_trigger=CreateTrigger()
    call TriggerAddAction(serial_trigger,function SerialFirst)
    call TriggerAddAction(serial_trigger,function SerialSecond)
    call TriggerWaitOnSleeps(serial_trigger,true)
    set parallel_trigger=CreateTrigger()
    call TriggerAddAction(parallel_trigger,function ParallelFirst)
    call TriggerAddAction(parallel_trigger,function ParallelSecond)
    call TriggerWaitOnSleeps(parallel_trigger,false)
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    set main_before=1
    call TriggerSleepAction(0.125)
    set main_after=1
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'tmp/docs-artifacts/war3/script-threads/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()

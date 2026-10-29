"""Author: MiYu. Build an isolated map with custom upgrades and actual research event consumers."""
import argparse
import hashlib
import importlib.util
import io
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('live_fixture', pathlib.Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

SCRIPT = '''globals
unit probe_forge=null
unit probe_second=null
unit probe_footman=null
integer probe_started=0
integer probe_cancelled=0
integer probe_finished=0
boolean probe_cancel_on_start=false
endglobals
function ProbeResearch takes nothing returns nothing
    if GetResearched()!='R0T1' then
        call ExecuteFunc("ResearchFailure_event_id")
    endif
    if GetTriggerEventId()==EVENT_UNIT_RESEARCH_START then
        set probe_started=probe_started+1
        if probe_cancel_on_start then
            call IssueImmediateOrder(GetTriggerUnit(),"cancel")
        endif
    elseif GetTriggerEventId()==EVENT_UNIT_RESEARCH_CANCEL then
        set probe_cancelled=probe_cancelled+1
    else
        if GetPlayerTechCount(Player(0),'R0T1',true)!=probe_finished+1 then
            call ExecuteFunc("ResearchFailure_finish_level")
        endif
        set probe_finished=probe_finished+1
    endif
endfunction
function ProbeCancelOnStart takes nothing returns nothing
    set probe_cancel_on_start=true
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
    local real x=GetStartLocationX(0)
    local real y=GetStartLocationY(0)
    local trigger t=CreateTrigger()
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_GOLD,1000)
    call SetPlayerState(Player(0),PLAYER_STATE_RESOURCE_LUMBER,1000)
    set probe_forge=CreateUnit(Player(0),'hbla',x,y,270)
    set probe_second=CreateUnit(Player(0),'hbla',x+256,y,270)
    set probe_footman=CreateUnit(Player(0),'hfoo',x+128,y,270)
    call TriggerRegisterUnitEvent(t,probe_forge,EVENT_UNIT_RESEARCH_START)
    call TriggerRegisterUnitEvent(t,probe_forge,EVENT_UNIT_RESEARCH_CANCEL)
    call TriggerRegisterUnitEvent(t,probe_forge,EVENT_UNIT_RESEARCH_FINISH)
    call TriggerAddAction(t,function ProbeResearch)
endfunction
'''


def modification(field, value, marker, level=None):
    kind = 3 if isinstance(value, str) else 0
    result = field.encode('ascii') + struct.pack('<I', kind)
    if level is not None:
        result += struct.pack('<II', level, 0)
    result += value.encode('utf-8') + b'\0' if kind == 3 else struct.pack('<i', value)
    return result + marker


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT/'tmp/docs-artifacts/war3/research/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only game installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    changes = [('gtib', 2, 0), ('gtim', 0, 0), ('gglb', 10, 0), ('gglm', 5, 0), ('glmb', 7, 0), ('glmm', 3, 0), ('gef2', 'rhpx', 0), ('gba2', 20, 0), ('gmo2', 20, 0), ('gef3', 'ratx', 0), ('gba3', 4, 0), ('gmo3', 4, 0), ('gnam', 'First', 1), ('gnam', 'Second', 2), ('gnam', 'Third', 3), ('greq', '', 2), ('greq', '', 3)]
    files['war3map.w3q'] = struct.pack('<III', 2, 0, 1) + b'RhmeR0T1' + struct.pack('<I', len(changes)) + b''.join(modification(field, value, b'R0T1', level) for field, value, level in changes)
    units = [(b'hbla', 'ures', 'R0T1,Rhar'), (b'hfoo', 'upgr', 'R0T1,Rhar')]
    custom = b'z0u1'
    custom_changes = [('utyp', 'Mechanical,Peon'), ('umvt', 'fly')]
    files['war3map.w3u'] = struct.pack('<II', 2, len(units)) + b''.join(unit + bytes(4) + struct.pack('<I', 1) + modification(field, value, unit) for unit, field, value in units) + struct.pack('<I', 1) + b'hfoo' + custom + struct.pack('<I', len(custom_changes)) + b''.join(modification(field, value, custom) for field, value in custom_changes)
    base_buff, custom_buff = b'Bblo', b'B0T1'
    original_buff_changes = [('ftip', 'Base buff title'), ('fube', 'Base buff description'), ('fart', 'BaseBuffIcon.blp'), ('ftat', 'BaseBuffEffect.mdx')]
    custom_buff_changes = [('ftip', 'Custom buff title'), ('fart', 'CustomBuffIcon.blp')]
    files['war3map.w3h'] = struct.pack('<II', 2, 1) + base_buff + bytes(4) + struct.pack('<I', len(original_buff_changes)) + b''.join(modification(field, value, base_buff) for field, value in original_buff_changes) + struct.pack('<I', 1) + base_buff + custom_buff + struct.pack('<I', len(custom_buff_changes)) + b''.join(modification(field, value, custom_buff) for field, value in custom_buff_changes)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))
    print('source_sha256='+hashlib.sha256(original).hexdigest())


if __name__ == '__main__':
    main()

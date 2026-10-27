"""Author: MiYu. Isolated widget event and lumber consumers on copied original terrain."""
import argparse
import importlib.util
import io
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('live_fixture', pathlib.Path(__file__).with_name('generate-live-world-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

SCRIPT = '''globals
destructable probe_tree=null
integer probe_deaths=0
integer probe_enumerated=0
endglobals
function ProbeDeath takes nothing returns nothing
    if GetTriggerDestructable()!=probe_tree or GetTriggerWidget()!=probe_tree then
        call ExecuteFunc("DestructableFailure_death_context")
    endif
    set probe_deaths=probe_deaths+1
endfunction
function ProbeWatch takes destructable d returns nothing
    local trigger t=CreateTrigger()
    set probe_tree=d
    call TriggerRegisterDeathEvent(t,d)
    call TriggerAddAction(t,function ProbeDeath)
endfunction
function ProbeFilter takes nothing returns boolean
    return GetFilterDestructable()==probe_tree
endfunction
function ProbeEnumerated takes nothing returns nothing
    if GetEnumDestructable()!=probe_tree then
        call ExecuteFunc("DestructableFailure_enum_context")
    endif
    set probe_enumerated=probe_enumerated+1
endfunction
function ProbeEnumerate takes real x, real y returns nothing
    local rect r=Rect(x-128,y-128,x+128,y+128)
    call EnumDestructablesInRect(r,Filter(function ProbeFilter),function ProbeEnumerated)
    call RemoveRect(r)
endfunction
function config takes nothing returns nothing
endfunction
function main takes nothing returns nothing
endfunction
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT/'tmp/docs-artifacts/war3/destructables/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only game installation')
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

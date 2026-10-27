"""Author: MiYu. Source map geometry and custom Channel object fields for deferred stage verification."""
import argparse
import importlib.util
import io
import struct
from pathlib import Path

spec = importlib.util.spec_from_file_location('spell_fixture', Path(__file__).with_name('generate-spell-fixture.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
SCRIPT = fixture.SCRIPT.replace('boolean probe_remove=false', 'boolean probe_remove=false\nboolean probe_pause_finish=false\nboolean probe_stop_effect=false').replace('    set probe_effect=probe_effect+1', '    set probe_effect=probe_effect+1\n    if probe_stop_effect then\n        call IssueImmediateOrder(probe_caster,"stop")\n    endif').replace('    set probe_finish=probe_finish+1', '    set probe_finish=probe_finish+1\n    if probe_pause_finish then\n        call PauseUnit(probe_caster,true)\n    endif')
SCRIPT += '''
function ProbePauseFinish takes boolean active returns nothing
    set probe_pause_finish=active
endfunction
function ProbeStopEffect takes boolean active returns nothing
    set probe_stop_effect=active
endfunction
'''


def modification(field, kind, value, slot, marker):
    payload = value.encode('ascii')+b'\0' if kind == 3 else struct.pack('<f' if kind == 2 else '<i', value)
    return field.encode('ascii')+struct.pack('<III', kind, 1, slot)+payload+marker


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=fixture.ROOT/'tmp/docs-artifacts/war3/channels/fixture.w3m')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.data_root.resolve()):
        raise ValueError('Fixture output must stay outside the read-only installation')
    original = (args.data_root/'Maps/(2)BootyBay.w3m').read_bytes()
    offset = original.index(b'MPQ\x1a')
    archive = fixture.fixture.mpyq.MPQArchive(io.BytesIO(original[offset:]), listfile=False)
    names = fixture.fixture.read_archive(archive, '(listfile)').decode('ascii').splitlines()
    files = {name: fixture.fixture.read_archive(archive, name) for name in names if name and name != '(listfile)'}
    files['war3map.j'] = SCRIPT.encode('utf-8')
    channels = []
    for marker, targeting, options in [(b'A0CN', 0, 1), (b'A0CU', 1, 5), (b'A0CP', 2, 3), (b'A0CE', 3, 19), (b'A0CH', 0, 0)]:
        changes = [('Ncl1', 2, .5, 1), ('Ncl2', 0, targeting, 2), ('Ncl3', 0, options, 3), ('Ncl4', 2, .125, 4), ('Ncl5', 0, 1, 5), ('Ncl6', 3, 'cripple' if marker == b'A0CU' else 'curse' if marker == b'A0CP' else 'channel', 6), ('aare', 2, 200., 0)]
        channels.append(b'ANcl'+marker+struct.pack('<I', len(changes))+b''.join(modification(field, kind, value, slot, marker) for field, kind, value, slot in changes))
    files['war3map.w3a'] = struct.pack('<III', 2, 0, len(channels))+b''.join(channels)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(original[:offset]+fixture.fixture.build_archive(files))
    print('fixture='+str(args.output.resolve()))


if __name__ == '__main__':
    main()

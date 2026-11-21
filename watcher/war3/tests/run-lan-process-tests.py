# Author: MiYu. Run isolated same-build LAN peers and compare their simulation traces.
import argparse
import os
from pathlib import Path
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('executable', type=Path)
    parser.add_argument('data_root', type=Path)
    parser.add_argument('output_root', type=Path)
    parser.add_argument('--mode', choices=('sync', 'abrupt', 'three', 'long'), default='sync')
    parser.add_argument('--map', type=Path, help='synthetic quartermaster fixture for long mode')
    args = parser.parse_args()
    if (args.mode == 'long') != (args.map is not None):
        parser.error('--map is required for long mode and only valid in that mode')
    executable, data_root = args.executable.resolve(strict=True), args.data_root.resolve(strict=True)
    args.output_root.mkdir(parents=True, exist_ok=True)
    family = 'multi' if args.mode in ('three', 'long') else 'two'
    default_marker = {
        'sync': 'PASS peer=',
        'abrupt': 'PASS abnormal_departure event=1 player=1 later_slots=9',
        'three': 'PASS abnormal_departure event=1 player=2 later_slots=9',
        'long': 'PASS long_match slots=22500 simulated_ms=720000',
    }[args.mode]
    target = {'abrupt': 'peer', 'three': 'victim'}.get(args.mode)
    run = Path(tempfile.mkdtemp(prefix=f'lan-{family}-process-', dir=args.output_root.resolve()))
    token = str(time.time_ns())
    processes, outputs = {}, {}

    def start(role):
        user = run / ('user-' + role)
        user.mkdir()
        env = os.environ.copy()
        env['MEGINE_WAR3_USER_DIR'] = str(user)
        outputs[role] = (run / (role + '.log')).open('wb')
        command = [str(executable), role, str(data_root), token, args.mode]
        if args.map is not None:
            command += [str(args.map.resolve(strict=True)), str(run)]
        processes[role] = subprocess.Popen(command, env=env, stdout=outputs[role], stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)

    def wait_for(role, marker, deadline):
        while marker not in (run / (role + '.log')).read_bytes():
            if any(process.poll() is not None for process in processes.values()):
                raise RuntimeError(f'LAN peer exited before {marker!r}; see {run}')
            if time.monotonic() >= deadline:
                raise TimeoutError(f'LAN peer timeout; see {run}')
            time.sleep(.05)

    try:
        deadline = time.monotonic() + (150 if args.mode == 'long' else 65)
        start('host')
        time.sleep(.3)
        start('peer')
        if args.mode in ('three', 'long'):
            wait_for('peer', b'JOINED id=2', deadline)
            start('guest' if args.mode == 'long' else 'victim')
        if target:
            wait_for(target, b'READY_TO_KILL', deadline)
            if processes[target].poll() is not None:
                raise RuntimeError(f'{target} exited before forced termination; see {run}')
            processes[target].kill()
        while any(process.poll() is None for process in processes.values()):
            if any(process.poll() not in (None, 0) for role, process in processes.items() if role != target):
                break
            if time.monotonic() >= deadline:
                raise TimeoutError(f'LAN peer timeout; see {run}')
            time.sleep(.05)
    finally:
        for process in processes.values():
            if process.poll() is None:
                process.kill()
        for process in processes.values():
            process.wait()
        for output in outputs.values():
            output.close()
    traces, post_traces, outcomes = {}, {}, {}
    for role, process in processes.items():
        log = (run / (role + '.log')).read_text(encoding='utf-8', errors='replace')
        if role == target:
            if process.returncode != 1 or 'READY_TO_KILL' not in log:
                raise RuntimeError(f'{role} termination differed ({process.returncode}); see {run / (role + ".log")}')
        elif process.returncode or default_marker not in log:
            raise RuntimeError(f'{role} failed ({process.returncode}); see {run / (role + ".log")}')
        lines = log.splitlines()
        traces[role] = [line for line in lines if line.startswith('FRAME ')]
        post_traces[role] = [line for line in lines if line.startswith('POST ')]
        outcomes[role] = [line for line in lines if line.startswith('MATCH ')]
    frames = 22500 if args.mode == 'long' else 80
    if len(traces['host']) != frames or any(trace != traces['host'] for trace in traces.values()):
        raise RuntimeError(f'LAN peer traces differ; see {run}')
    if args.mode == 'three' and (len(post_traces['host']) < 10 or post_traces['host'] != post_traces['peer']):
        raise RuntimeError(f'LAN post-departure traces differ; see {run}')
    if args.mode == 'long':
        if len(outcomes['host']) != 1 or any(outcome != outcomes['host'] for outcome in outcomes.values()):
            raise RuntimeError(f'LAN long match outcomes differ; see {run}')
        if not (run / 'host.w3g').is_file():
            raise RuntimeError(f'LAN host replay is missing; see {run}')
        print(outcomes['host'][0])
    print(f'PASS {family}_process_lan_{args.mode} frames={frames} output={run}')
    print('RESULT passed=1 failed=0')


if __name__ == '__main__':
    main()

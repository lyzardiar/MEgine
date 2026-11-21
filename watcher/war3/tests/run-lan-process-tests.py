# Author: MiYu. Run two isolated same-build LAN peers and compare their simulation traces.
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
    parser.add_argument('--mode', choices=('sync', 'abrupt'), default='sync')
    args = parser.parse_args()
    executable, data_root = args.executable.resolve(strict=True), args.data_root.resolve(strict=True)
    args.output_root.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix='lan-two-process-', dir=args.output_root.resolve()))
    token = str(time.time_ns())
    processes, outputs = {}, {}
    try:
        for role in ('host', 'peer'):
            user = run / ('user-' + role)
            user.mkdir()
            env = os.environ.copy()
            env['MEGINE_WAR3_USER_DIR'] = str(user)
            outputs[role] = (run / (role + '.log')).open('wb')
            processes[role] = subprocess.Popen([str(executable), role, str(data_root), token, args.mode], env=env, stdout=outputs[role], stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
            if role == 'host':
                time.sleep(.3)
        deadline = time.monotonic() + 65
        killed = False
        while any(process.poll() is None for process in processes.values()):
            if args.mode == 'abrupt' and not killed and b'READY_TO_KILL' in (run / 'peer.log').read_bytes():
                if processes['peer'].poll() is not None:
                    raise RuntimeError(f'Peer exited before forced termination; see {run}')
                processes['peer'].kill()
                killed = True
            if processes['host'].poll() not in (None, 0) or (not killed and processes['peer'].poll() not in (None, 0)):
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
    traces = {}
    for role, process in processes.items():
        log = (run / (role + '.log')).read_text(encoding='utf-8', errors='replace')
        if args.mode == 'abrupt' and role == 'peer':
            if not killed or process.returncode != 1 or 'READY_TO_KILL' not in log:
                raise RuntimeError(f'Peer termination differed ({process.returncode}); see {run / (role + ".log")}')
        elif process.returncode or ('PASS abnormal_departure event=1 player=1 later_slots=9' if args.mode == 'abrupt' else 'PASS peer=') not in log:
            raise RuntimeError(f'{role} failed ({process.returncode}); see {run / (role + ".log")}')
        traces[role] = [line for line in log.splitlines() if line.startswith('FRAME ')]
    if len(traces['host']) != 80 or traces['host'] != traces['peer']:
        raise RuntimeError(f'LAN peer traces differ; see {run}')
    print(f'PASS two_process_lan_{args.mode} frames=80 output={run}')
    print('RESULT passed=1 failed=0')


if __name__ == '__main__':
    main()

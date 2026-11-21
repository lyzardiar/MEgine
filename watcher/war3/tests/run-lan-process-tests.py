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
            processes[role] = subprocess.Popen([str(executable), role, str(data_root), token], env=env, stdout=outputs[role], stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
            if role == 'host':
                time.sleep(.3)
        deadline = time.monotonic() + 65
        while any(process.poll() is None for process in processes.values()):
            if any(process.poll() not in (None, 0) for process in processes.values()):
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
        if process.returncode or 'PASS peer=' not in log:
            raise RuntimeError(f'{role} failed ({process.returncode}); see {run / (role + ".log")}')
        traces[role] = [line for line in log.splitlines() if line.startswith('FRAME ')]
    if len(traces['host']) != 80 or traces['host'] != traces['peer']:
        raise RuntimeError(f'LAN peer traces differ; see {run}')
    print(f'PASS two_process_lan_selection_and_movement frames=80 output={run}')
    print('RESULT passed=1 failed=0')


if __name__ == '__main__':
    main()

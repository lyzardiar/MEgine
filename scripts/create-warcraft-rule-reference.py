"""Author: MiYu. Build an isolated original-game test map without changing installed maps."""
import argparse
import hashlib
import io
import json
import pathlib
import re
import struct
import time
from warcraft_mpq import mpyq, read_archive
from warcraft_mpq_writer import build_archive

ROOT = pathlib.Path(__file__).resolve().parents[1]
GAME = pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne')
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def create(template, output, game, tag):
    raw = template.read_bytes(); offset = raw.find(b'MPQ\x1a')
    if offset < 0: raise ValueError('Missing template MPQ')
    archive = mpyq.MPQArchive(io.BytesIO(raw[offset:]), listfile=False)
    names = [name.decode('ascii') for name in read_archive(archive, '(listfile)').splitlines()]
    files = {name: read_archive(archive, name) for name in names if name.lower() not in ['(listfile)', '(attributes)', '(signature)']}
    original_jass = files['war3map.j'].decode('utf-8-sig')
    start = re.search(r'DefineStartLocation\s*\(\s*0\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)', original_jass)
    if not start: raise ValueError('Missing template start location')
    output = output.resolve(); output.mkdir(parents=True, exist_ok=False)
    result = output / (tag + '.pld')
    script = (ROOT / 'scripts/warcraft-rule-reference.j').read_text(encoding='utf-8')
    script = script.replace('@X@', start[1]).replace('@Y@', start[2]).replace('@OUTPUT@', str(result).replace('\\', '\\\\')).replace('@TAG@', tag)
    if re.search(r'@[A-Z]+@', script): raise ValueError('Unresolved JASS placeholder')
    archives = [(name, mpyq.MPQArchive(str(game / name), listfile=False)) for name in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq']]
    definitions = ''
    scripts = []
    for source in ['Scripts\\common.j', 'Scripts\\Blizzard.j']:
        for name, pack in reversed(archives):
            try: data = read_archive(pack, source); break
            except FileNotFoundError: continue
        else: raise ValueError('Missing original JASS definitions: ' + source)
        definitions += data.decode('utf-8-sig') + '\n'; scripts.append({'path': source, 'archive': name, 'sha256': sha(data)})
    declared = set(re.findall(r'\b(?:native|function)\s+(\w+)\s+takes', definitions + script))
    calls = set(re.findall(r'\bcall\s+(\w+)\s*\(', script))
    if calls - declared: raise ValueError('Unknown original JASS calls: ' + repr(calls - declared))
    files['war3map.j'] = script.encode('ascii')
    header = b'HM3W' + struct.pack('<I', 0) + b'MEngine original-rule reference\0' + struct.pack('<2I', 0, 2)
    packed = header.ljust(512, b'\0') + build_archive(files)
    map_path = output / (tag + '.w3x'); map_path.write_bytes(packed)
    check = mpyq.MPQArchive(io.BytesIO(packed[512:]))
    for name, content in files.items():
        if read_archive(check, name) != content: raise ValueError('Map round-trip differs: ' + name)
    receipt = {'author': 'MiYu', 'tag': tag, 'map': str(map_path), 'mapSha256': sha(packed), 'template': str(template), 'templateSha256': sha(raw), 'templateLicense': 'Original Blizzard map data; no free redistribution license established.', 'scriptSha256': sha(files['war3map.j']), 'definitions': scripts, 'fileCount': len(files), 'nativeCallsChecked': len(calls), 'start': list(map(float, start.groups())), 'result': str(result), 'relativeResult': 'CustomMapData/' + tag + '.pld', 'cache': tag + '.w3v', 'runtime': {name: sha((game / name).read_bytes()) for name in ['War3.exe', 'Game.dll']}, 'runtimeAcceptance': 'Unverified until original-game output is collected.'}
    (output / 'war3map.j').write_bytes(files['war3map.j'])
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt))
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=pathlib.Path, default=GAME)
    parser.add_argument('--template', type=pathlib.Path, default=GAME / 'Maps/FrozenThrone/(2)EchoIsles.w3x')
    parser.add_argument('--output', type=pathlib.Path)
    parser.add_argument('--tag', default='MEngineReference-' + str(int(time.time() * 1000)))
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9-]+', args.tag): parser.error('Tag must contain ASCII letters, numbers and hyphens')
    create(args.template, args.output or ROOT / 'tmp' / args.tag, args.game, args.tag)

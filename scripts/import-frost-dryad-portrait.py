"""Author: MiYu. Preserve the original static Dryad portrait camera in engine coordinates."""
import argparse
import hashlib
import json
import math
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parent.parent


def convert(raw):
    assert raw[:4] == b'MDLX', 'Expected an original MDX model'
    offset, cameras = 4, []
    while offset < len(raw):
        tag, length = struct.unpack_from('<4sI', raw, offset); offset += 8
        end = offset + length
        assert end <= len(raw), 'Invalid MDX chunk'
        if tag == b'CAMS':
            while offset < end:
                size = struct.unpack_from('<I', raw, offset)[0]
                assert size >= 120 and offset + size <= end, 'Invalid MDX camera'
                name = raw[offset + 4:offset + 84].split(b'\0')[0].decode('ascii')
                values = struct.unpack_from('<9f', raw, offset + 84)
                track = offset + 120
                while track < offset + size:
                    kind, count, interpolation, sequence = struct.unpack_from('<4sIIi', raw, track); track += 16
                    assert kind in [b'KCTR', b'KTTR', b'KCRL'] and interpolation == 0 and sequence == -1, 'Unsupported animated portrait camera'
                    dimensions = 1 if kind == b'KCRL' else 3
                    for _ in range(count):
                        assert track + 4 + dimensions * 4 <= offset + size, 'Invalid camera track'
                        assert all(v == 0 for v in struct.unpack_from('<' + str(dimensions) + 'f', raw, track + 4)), 'Non-static portrait camera'
                        track += 4 + dimensions * 4
                assert track == offset + size
                cameras.append(dict(name=name, position=list(values[:3]), fovRadians=values[3], far=values[4], near=values[5], target=list(values[6:9])))
                offset += size
        offset = end
    assert offset == len(raw) and len(cameras) == 1, 'Expected one portrait camera'
    source = cameras[0]
    def point(p): return [p[0] / 128, p[2] / 128, -p[1] / 128]
    position, target = point(source['position']), point(source['target'])
    dx, dy, dz = [b - a for a, b in zip(position, target)]
    yaw, pitch = math.atan2(-dx, -dz), math.atan2(dy, math.hypot(dx, dz))
    sy, cy, sp, cp = math.sin(yaw / 2), math.cos(yaw / 2), math.sin(pitch / 2), math.cos(pitch / 2)
    return dict(sourceCamera=source, axes='(x,y,z) -> (x,z,-y)', sourceUnitsPerModelUnit=128, view=dict(modelRotation=[0, 0, 0, 1], camera=dict(position=position, rotation=[sp * cy, cp * sy, -sp * sy, cp * cy], scale=[1, 1, 1]), camera3D=dict(projection='perspective', fov_y_degrees=math.degrees(source['fovRadians']), near=source['near'] / 128, far=source['far'] / 128)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=pathlib.Path, default=ROOT / 'asset-library/warcraft-iii/remaining-ready/SourceAssets/Units/NightElf/Dryad/Dryad_portrait.mdx')
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'samples/frostbound-realms/dryad-portrait.json')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args(); raw = args.source.read_bytes()
    source = 'Units\\NightElf\\Dryad\\Dryad_portrait.mdx'
    signed = json.loads((ROOT / 'samples/frostbound-realms/dryad-sources.json').read_bytes())
    digest = hashlib.sha256(raw).hexdigest()
    assert any(r['path'] == source and r['sha256'] == digest for r in signed['sources']), 'Portrait source hash mismatch'
    data = dict(author='MiYu', source=source, sourceSha256=digest, generator='scripts/import-frost-dryad-portrait.py', generatorSha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(), **convert(raw))
    encoded = (json.dumps(data, separators=(',', ':'), ensure_ascii=False) + '\n').encode('utf-8')
    if args.check: assert args.output.read_bytes() == encoded, 'Portrait camera output changed'
    else: args.output.write_bytes(encoded)
    print('PASS original Dryad camera: signed MDX source, static tracks, coordinates, FOV and deterministic output')


if __name__ == '__main__': main()

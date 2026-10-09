"""Author: MiYu. Preserve MDX portrait camera tracks, tangents, sequence windows and source projection."""
import math
import struct


def sample(track, sequence, time, globals, wall=0):
    if not track: return [0]
    keys = track['keys']; global_id = track['globalSequence']
    if global_id >= 0:
        period = globals[global_id]; time = wall % period if period else 0
    else: keys = [k for k in keys if sequence['start'] <= k['time'] <= sequence['end']]
    if not keys: return [0] * track['dimensions']
    if time <= keys[0]['time']: return keys[0]['value']
    if time >= keys[-1]['time']: return keys[-1]['value']
    a, b = next((a, b) for a, b in zip(keys, keys[1:]) if a['time'] <= time < b['time'])
    t = (time - a['time']) / (b['time'] - a['time']); u = 1 - t; mode = track['interpolation']
    if mode == 0: return a['value']
    if mode == 1: return [x * u + y * t for x, y in zip(a['value'], b['value'])]
    weights = [2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t, t**3 - t**2, -2 * t**3 + 3 * t**2] if mode == 2 else [u**3, 3 * u**2 * t, 3 * u * t**2, t**3]
    return [sum(w * v for w, v in zip(weights, values)) for values in zip(a['value'], a['outTangent'], b['inTangent'], b['value'])]


def view(camera, sequence, time, globals):
    def point(base, tag):
        offset = sample(camera['tracks'][tag], sequence, time, globals) if tag in camera['tracks'] else [0, 0, 0]
        p = [a + b for a, b in zip(base, offset)]; return [p[0] / 128, p[2] / 128, -p[1] / 128]
    position, target = point(camera['position'], 'KCTR'), point(camera['target'], 'KTTR')
    dx, dy, dz = [b - a for a, b in zip(position, target)]
    assert dx * dx + dy * dy + dz * dz > 0, 'Degenerate portrait camera'
    yaw, pitch = math.atan2(-dx, -dz), math.atan2(dy, math.hypot(dx, dz))
    sy, cy, sp, cp = math.sin(yaw / 2), math.cos(yaw / 2), math.sin(pitch / 2), math.cos(pitch / 2)
    q = [sp * cy, cp * sy, -sp * sy, cp * cy]
    roll = sample(camera['tracks']['KCRL'], sequence, time, globals)[0] if 'KCRL' in camera['tracks'] else 0
    sr, cr = math.sin(roll / 2), math.cos(roll / 2)
    q = [q[0] * cr + q[1] * sr, q[1] * cr - q[0] * sr, q[2] * cr + q[3] * sr, q[3] * cr - q[2] * sr]
    return dict(modelRotation=[0, 0, 0, 1], camera=dict(position=position, rotation=q, scale=[1, 1, 1]), camera3D=dict(projection='perspective', fov_y_degrees=math.degrees(camera['fovRadians']), near=camera['near'] / 128, far=camera['far'] / 128))


def convert(raw):
    assert raw[:4] == b'MDLX', 'Expected an original MDX model'
    offset, cameras, sequences, globals = 4, [], [], []
    while offset < len(raw):
        assert offset + 8 <= len(raw), 'Invalid MDX header'
        tag, length = struct.unpack_from('<4sI', raw, offset); offset += 8; end = offset + length
        assert end <= len(raw), 'Invalid MDX chunk'
        if tag == b'SEQS':
            assert length % 132 == 0, 'Invalid MDX sequences'
            for p in range(offset, end, 132):
                name = raw[p:p + 80].split(b'\0')[0].decode('ascii'); start, stop, speed, flags = struct.unpack_from('<IIfI', raw, p + 80)
                assert stop > start, 'Invalid portrait sequence interval'
                sequences.append(dict(name=name, start=start, end=stop, loop=not bool(flags & 1)))
        elif tag == b'GLBS':
            assert length % 4 == 0, 'Invalid global sequences'
            globals.extend(struct.unpack_from('<' + str(length // 4) + 'I', raw, offset))
        elif tag == b'CAMS':
            p = offset
            while p < end:
                assert p + 120 <= end, 'Invalid MDX camera header'
                size = struct.unpack_from('<I', raw, p)[0]; assert size >= 120 and p + size <= end, 'Invalid MDX camera'
                name = raw[p + 4:p + 84].split(b'\0')[0].decode('ascii'); values = struct.unpack_from('<9f', raw, p + 84); at = p + 120; tracks = {}
                while at < p + size:
                    assert at + 16 <= p + size, 'Invalid camera track header'
                    kind, count, interpolation, global_id = struct.unpack_from('<4sIIi', raw, at); at += 16
                    assert kind in [b'KCTR', b'KTTR', b'KCRL'] and interpolation in range(4) and global_id >= -1, 'Unsupported portrait camera track'
                    tag_name = kind.decode('ascii'); assert tag_name not in tracks, 'Duplicate camera track'
                    dimensions = 1 if kind == b'KCRL' else 3; keys = []; components = dimensions * (3 if interpolation > 1 else 1)
                    for _ in range(count):
                        assert at + 4 + components * 4 <= p + size, 'Invalid camera key'
                        time = struct.unpack_from('<I', raw, at)[0]; data = struct.unpack_from('<' + str(components) + 'f', raw, at + 4); at += 4 + components * 4
                        assert all(math.isfinite(v) for v in data), 'Invalid camera value'
                        assert not keys or time > keys[-1]['time'], 'Unordered camera keys'
                        key = dict(time=time, value=list(data[:dimensions]))
                        if interpolation > 1: key.update(inTangent=list(data[dimensions:dimensions * 2]), outTangent=list(data[dimensions * 2:]))
                        keys.append(key)
                    tracks[tag_name] = dict(dimensions=dimensions, interpolation=interpolation, globalSequence=global_id, keys=keys)
                assert at == p + size
                cameras.append(dict(name=name, position=list(values[:3]), fovRadians=values[3], far=values[4], near=values[5], target=list(values[6:9]), tracks=tracks)); p += size
        offset = end
    assert offset == len(raw) and len(cameras) == 1 and sequences, 'Expected one portrait camera and animation sequences'
    camera = cameras[0]
    assert all(math.isfinite(v) for v in [*camera['position'], *camera['target'], camera['fovRadians'], camera['near'], camera['far']]) and 0 < camera['fovRadians'] < math.pi and 0 < camera['near'] < camera['far'], 'Invalid portrait projection'
    assert all(t['globalSequence'] < len(globals) for t in camera['tracks'].values()), 'Invalid camera global sequence'
    first = next((s for s in sequences if s['name'].lower().startswith('portrait') and 'talk' not in s['name'].lower()), sequences[0])
    return dict(schemaVersion=1, sourceCamera=camera, sequences=sequences, globalSequences=globals, initialSequence=sequences.index(first), axes='(x,y,z) -> (x,z,-y)', sourceUnitsPerModelUnit=128, view=view(camera, first, first['start'], globals))

"""Author: MiYu. Convert preserved Warcraft camera defaults and map bounds to engine coordinates."""
import configparser
import json
import math
from pathlib import Path

PROJECTION_CONVENTION = 'Game.dll 0x6f0d31d0: verticalFov = sourceFov / sqrt(1 + aspect * aspect); aspect is the source logical projection rectangle width/height'
PROJECTION_SOURCE = dict(binary='Game.dll', sha256='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a', function='0x6f0d31d0', probe='scripts/probe-frost-rea-camera.mjs', layout=dict(rootSize=[.8,.6], bottomInset=.13, topInset=.02, anchors='0x6f34a737-0x6f34a78c'))


def camera_vertical_fov(source_fov, aspect=16/9):
    if not math.isfinite(aspect) or aspect <= 0: raise ValueError('Invalid camera aspect')
    return source_fov / math.sqrt(1+aspect*aspect)


def camera_config(data, misc):
    ini = configparser.ConfigParser(strict=False, inline_comment_prefixes=('//',), interpolation=None)
    ini.read_string(misc.decode('utf-8-sig'))
    values = lambda key: [float(v) for v in ini['Camera'][key].split(',')]
    angles, distances, fovs = values('AOA'), values('Distance'), values('FOV')
    terrain, info = data['terrain'], data.get('info') or {}
    width, height = terrain['vertexSize']; ox, oy = terrain['origin']
    bounds = [ox/128, ox/128+width-1, -oy/128-height+1, -oy/128]
    source_bounds = info.get('cameraBounds', [])
    if len(source_bounds) == 8:
        xs, zs = source_bounds[::2], [-y for y in source_bounds[1::2]]
        candidate = [max(bounds[0], min(xs)/128), min(bounds[1], max(xs)/128), max(bounds[2], min(zs)/128), min(bounds[3], max(zs)/128)]
        if candidate[0] < candidate[1] and candidate[2] < candidate[3]: bounds = candidate
    players = sorted((p for p in info.get('players', []) if p.get('type') == 1), key=lambda p: p['id'])
    start = players[0]['startLocation'] if players else [ox+(width-1)*64, oy+(height-1)*64]
    target = [max(bounds[0], min(bounds[1], start[0]/128)), max(bounds[2], min(bounds[3], -start[1]/128))]
    presets = [dict(pitch=math.radians(angle-360), distance=distance/128, fov=fov) for angle, distance, fov in zip(angles, distances, fovs)]
    if not presets or any(not 0 < p['distance'] or not 0 < p['fov'] < 180 for p in presets): raise ValueError('Invalid source camera defaults')
    return dict(version=2, projectionAspect=16/9, bounds=bounds, target=target, yaw=math.radians(90-values('Rotation')[0]), presets=presets, near=values('NearZ')[0]/128, far=values('FarZ')[0]/128, speed=float(ini['CameraRates']['Forward'])/128,
                terrain=dict(size=[width,height], origin=[ox/128,-oy/128], heights=[(c[0]-8192)/512+(c[4]&15)-2 for c in terrain['corners']]))


def camera_transform(config):
    x, z = config['target']; terrain = config['terrain']; w, h = terrain['size']
    ix, iz = max(0,min(w-1,round(x-terrain['origin'][0]))), max(0,min(h-1,round(terrain['origin'][1]-z)))
    ground = terrain['heights'][iz*w+ix]
    preset = config['presets'][0]; pitch, yaw, distance = preset['pitch'], config['yaw'], preset['distance']
    sp, cp, sy, cy = math.sin(pitch/2), math.cos(pitch/2), math.sin(yaw/2), math.cos(yaw/2)
    return dict(position=[x+math.sin(yaw)*math.cos(pitch)*distance,ground-math.sin(pitch)*distance,z+math.cos(yaw)*math.cos(pitch)*distance], rotation=[cy*sp,sy*cp,-sy*sp,cy*cp], scale=[1,1,1])


def camera_script(config):
    runtime = Path(__file__).with_name('frost-original-camera-client.js').read_text(encoding='utf-8')
    return '\nvar originalCameraConfig='+json.dumps(config,separators=(',',':'),allow_nan=False)+';\n'+runtime

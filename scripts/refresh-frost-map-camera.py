"""Author: MiYu. Upgrade an installed map's camera without reconverting shared terrain/model assets."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from warcraft_map import load_map
from warcraft_mpq import mpyq, read_archive
from warcraft_camera import camera_config, camera_transform, camera_script, camera_vertical_fov, PROJECTION_CONVENTION, PROJECTION_SOURCE

ROOT = Path(__file__).resolve().parents[1]


def split_unit_initialization(script):
    marker = '\n/* Frost unit initialization source */\nvar originalUnitInitializationSource='
    start = script.find(marker)
    if start < 0: return script, ''
    encoded = script[start+len(marker):]
    source, end = json.JSONDecoder().raw_decode(encoded)
    rest=encoded[end:].strip()
    if source is not None and not isinstance(source, str) or not rest.startswith(';'): raise ValueError('Unrecognized unit initialization boundary')
    rest=rest[1:].strip()
    if rest:
        prefix='var originalUnitBindings='
        if not rest.startswith(prefix): raise ValueError('Unrecognized unit initialization boundary')
        bindings, end=json.JSONDecoder().raw_decode(rest[len(prefix):])
        if not isinstance(bindings,dict) or rest[len(prefix)+end:].strip()!=';': raise ValueError('Unrecognized unit binding boundary')
    return script[:start], script[start:]


def upgrade(project, identifier, game):
    package = project/'Assets/Maps'/identifier
    package.resolve().relative_to((project/'Assets/Maps').resolve())
    manifest_path = package/'manifest.json'; manifest = json.loads(manifest_path.read_bytes())
    original = (project/manifest['installedSource']).resolve(); original.relative_to(package.resolve())
    data, _ = load_map(original)
    if data['source']['sha256'] != manifest['source']['sha256']: raise ValueError('Changed preserved map')
    script_path, scene_path = package/'Scripts/Main.js', package/'Scenes/Main.mscene'
    script, initialization = split_unit_initialization(script_path.read_bytes().decode('utf-8'))
    marker = 'var originalCameraConfig='
    if marker in script:
        start = script.index(marker)
        end = 'onTick=function(dt){originalCameraPreviousTick(dt);originalMapCamera.tick(dt);};'
        if script.count(marker) != 1 or script.count(end) != 1 or script[script.index(end)+len(end):].strip(): raise ValueError('Unrecognized camera controller boundary')
        script = script[:start].rstrip()+'\n'
    for archive_name in ['War3Patch.mpq','War3xLocal.mpq','War3x.mpq','war3.mpq']:
        archive = mpyq.MPQArchive(str(game/archive_name), listfile=False)
        try: misc = read_archive(archive, 'UI\\MiscData.txt')
        finally: archive.file.close()
        if misc: break
    else: raise FileNotFoundError('UI/MiscData.txt')
    config = camera_config(data, misc); scene = json.loads(scene_path.read_bytes())
    camera = next(e for e in scene['world']['entities'] if e['name'] == 'Camera')['components']
    camera['Transform'] = camera_transform(config)
    camera['Camera3D'].update(projection='perspective', fov_y_degrees=camera_vertical_fov(config['presets'][0]['fov']), near=config['near'], far=config['far'])
    scene_path.write_text(json.dumps(scene,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    script_path.write_text(script+camera_script(config)+initialization,encoding='utf-8',newline='\n')
    source_path = package/'Source/UI/MiscData.txt'; source_path.parent.mkdir(parents=True,exist_ok=True); source_path.write_bytes(misc)
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    manifest['camera'] = dict(source=str(source_path.relative_to(project)).replace('\\','/'), archive=archive_name, sha256=digest(source_path), config={k:v for k,v in config.items() if k!='terrain'},
                              tools=[dict(path=str(p.relative_to(ROOT)).replace('\\','/'),sha256=digest(p)) for p in [Path(__file__),ROOT/'scripts/warcraft_camera.py',ROOT/'scripts/frost-original-camera-client.js']],
                              projectionConvention=PROJECTION_CONVENTION, projectionSource=PROJECTION_SOURCE)
    for record in manifest['assets']:
        file = project/record['path']
        if file in (scene_path,script_path): record.update(sha256=digest(file),bytes=file.stat().st_size)
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    catalog = project/'Assets/Maps/catalog.json'
    if catalog.is_file() and any(entry['id'] == identifier for entry in json.loads(catalog.read_bytes())['maps']):
        subprocess.run(['node', str(ROOT/'scripts/frost-script-bundle.mjs'), str(ROOT/'samples/frostbound-realms'), str(project)], check=True)
    print(json.dumps(dict(map=identifier,camera=config['target'],source=archive_name),ensure_ascii=False))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('project',type=Path);parser.add_argument('map_id');parser.add_argument('--game',type=Path,default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'));args=parser.parse_args()
    upgrade(args.project.resolve(),args.map_id,args.game)

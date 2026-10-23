"""Author: MiYu. Upgrade an installed map's camera without reconverting shared terrain/model assets."""
import argparse
import hashlib
import json
from pathlib import Path
from warcraft_map import load_map
from warcraft_mpq import mpyq, read_archive
from warcraft_camera import camera_config, camera_transform, camera_script

ROOT = Path(__file__).resolve().parents[1]


def upgrade(project, identifier, game):
    package = project/'Assets/Maps'/identifier
    package.resolve().relative_to((project/'Assets/Maps').resolve())
    manifest_path = package/'manifest.json'; manifest = json.loads(manifest_path.read_bytes())
    original = (project/manifest['installedSource']).resolve(); original.relative_to(package.resolve())
    data, _ = load_map(original)
    if data['source']['sha256'] != manifest['source']['sha256']: raise ValueError('Changed preserved map')
    script_path, scene_path = package/'Scripts/Main.js', package/'Scenes/Main.mscene'
    script = script_path.read_bytes().decode('utf-8')
    if 'var originalCameraConfig=' in script: raise ValueError('This package already has the camera controller')
    for archive_name in ['War3Patch.mpq','War3xLocal.mpq','War3x.mpq','war3.mpq']:
        archive = mpyq.MPQArchive(str(game/archive_name), listfile=False)
        try: misc = read_archive(archive, 'UI\\MiscData.txt')
        finally: archive.file.close()
        if misc: break
    else: raise FileNotFoundError('UI/MiscData.txt')
    config = camera_config(data, misc); scene = json.loads(scene_path.read_bytes())
    camera = next(e for e in scene['world']['entities'] if e['name'] == 'Camera')['components']
    camera['Transform'] = camera_transform(config)
    camera['Camera3D'].update(projection='perspective', fov_y_degrees=config['presets'][0]['fov'], near=config['near'], far=config['far'])
    scene_path.write_text(json.dumps(scene,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    script_path.write_text(script+camera_script(config),encoding='utf-8',newline='\n')
    source_path = package/'Source/UI/MiscData.txt'; source_path.parent.mkdir(parents=True,exist_ok=True); source_path.write_bytes(misc)
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    manifest['camera'] = dict(source=str(source_path.relative_to(project)).replace('\\','/'), archive=archive_name, sha256=digest(source_path), config={k:v for k,v in config.items() if k!='terrain'},
                              tools=[dict(path=str(p.relative_to(ROOT)).replace('\\','/'),sha256=digest(p)) for p in [Path(__file__),ROOT/'scripts/warcraft_camera.py',ROOT/'scripts/frost-original-camera-client.js']],
                              projectionConvention='Source FOV applied as engine vertical FOV; original projection convention remains to be measured')
    for record in manifest['assets']:
        file = project/record['path']
        if file in (scene_path,script_path): record.update(sha256=digest(file),bytes=file.stat().st_size)
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(dict(map=identifier,camera=config['target'],source=archive_name),ensure_ascii=False))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('project',type=Path);parser.add_argument('map_id');parser.add_argument('--game',type=Path,default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'));args=parser.parse_args()
    upgrade(args.project.resolve(),args.map_id,args.game)

"""Author: MiYu. Export source unit bindings for an installed map without regenerating its art."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from warcraft_map import load_map
from warcraft_mpq import mpyq, read_archive
from warcraft_unit_bindings import build_bindings


def export(project, identifier, output, game):
    package=(project/'Assets/Maps'/identifier).resolve();package.relative_to((project/'Assets/Maps').resolve())
    manifest=json.loads((package/'manifest.json').read_bytes());archive_path=(project/manifest['installedSource']).resolve();archive_path.relative_to(package)
    data,members=load_map(archive_path)
    if data['source']['sha256']!=manifest['source']['sha256']:raise ValueError('Changed preserved map')
    if any(name in members for name in ['war3map.w3u','war3map.w3t','war3map.w3a']):raise ValueError('Unit overrides require resolution before binding')
    raw=archive_path.read_bytes();archives=[];cache={};sources={}
    try:
        archives.append(('map',mpyq.MPQArchive(io.BytesIO(raw[data['source']['mpqOffset']:]),listfile=False)))
        for name in ['War3Patch.mpq','War3xLocal.mpq','War3x.mpq','war3.mpq']:archives.append((name,mpyq.MPQArchive(str(game/name),listfile=False)))
        def read(name):
            key=name.replace('\\','/').lower()
            if key in cache:return cache[key]
            for archive_name,archive in archives:
                try:value=read_archive(archive,name.replace('/','\\'))
                except FileNotFoundError:continue
                cache[key]=value;sources[key]=dict(path=name,archive=archive_name,sha256=hashlib.sha256(value).hexdigest());return value
            raise FileNotFoundError(name)
        ground_meshes=[]
        for record in manifest['assets']:
            relative=record['path']
            source_path=record.get('sourcePath',relative.replace(f'Assets/Maps/{identifier}/','Assets/',1))
            if not source_path.startswith('Assets/Models/Ground-') or not source_path.endswith('.glb'):continue
            raw=(project/relative).read_bytes()
            if hashlib.sha256(raw).hexdigest()!=record['sha256']:raise ValueError('Changed terrain mesh: '+relative)
            ground_meshes.append((relative,raw))
        result=build_bindings(data,read,output,prefix=f'Assets/Maps/{identifier}/OriginalUnits/Selection/',ground_meshes=ground_meshes)
        visual=json.loads((package/'Provenance/unit-scene-sources.json').read_bytes())
        for record in visual['sources']:
            key=record['path'].replace('\\','/').lower()
            if key in sources and sources[key]['sha256']!=record['sha256']:raise ValueError('Definition/model differs from installed visual: '+key)
        result['sources']=[sources[p['path'].replace('\\','/').lower()] for p in result['sources']]
        (output/'Assets/Data/OriginalUnitBindings.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8',newline='\n')
        return dict(placements=len(result['placements']),definitions=len(result['definitions']),sourceSha256=result['sourceSha256'])
    finally:
        for _,archive in archives:archive.file.close()


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('project',type=Path);p.add_argument('map_id');p.add_argument('output',type=Path);p.add_argument('--game',type=Path,default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'));a=p.parse_args()
    print(json.dumps(export(a.project.resolve(),a.map_id,a.output.resolve(),a.game),ensure_ascii=True))

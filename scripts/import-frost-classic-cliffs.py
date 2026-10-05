"""Author: MiYu. Preserve authored Warcraft cliff meshes as reusable native grid-patch templates."""
import hashlib
import importlib.util
import json
from pathlib import Path, PureWindowsPath
import re
import shutil
import uuid

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
LIBRARY = ROOT / 'asset-library/warcraft-iii'
spec = importlib.util.spec_from_file_location('warcraft_validation', ROOT / 'scripts/validate-warcraft-assets.py')
validation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validation)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    if not path.exists() or path.read_bytes() != raw:
        path.write_bytes(raw)
    return raw

def main():
    previous = SAMPLE / 'classic-cliff-sources.json'
    old = {f['path']: f['sha256'] for f in json.loads(previous.read_text())['files']} if previous.exists() else {}
    files = {}
    def output(relative, value):
        path = SAMPLE / relative
        if path.exists():
            candidate = (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
            assert path.read_bytes() == candidate or old.get(relative) == digest(path.read_bytes()), f'Preserve modified cliff asset: {path}'
        raw = write(path, value)
        files[relative] = dict(path=relative, sha256=digest(raw), bytes=len(raw))
        if not relative.endswith('.meta'):
            meta = relative + '.meta'
            metadata = dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine:frostbound:classic-cliffs:' + relative)))
            target = SAMPLE / meta
            candidate = (json.dumps(metadata, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
            if target.exists():
                assert target.read_bytes() == candidate or old.get(meta) == digest(target.read_bytes()), f'Preserve modified cliff metadata: {target}'
            raw = write(target, metadata)
            files[meta] = dict(path=meta, sha256=digest(raw), bytes=len(raw))

    source = LIBRARY / 'remaining-ready'
    catalog = json.loads((source / 'Assets/WarcraftIII/model-catalog.json').read_text())
    models = sorted((m for m in catalog['models'] if re.fullmatch(r'(?:City)?Cliffs[ABC]{4}\d+', m['id'])), key=lambda m: m['id'])
    assert len(models) == 205
    templates, records, groups = [], [], {'Cliffs': {}, 'CityCliffs': {}}
    for model in models:
        assert len(model['parts']) == 1, model['id']
        part = model['parts'][0]
        assert part['replaceableId'] == 11
        path = source / part['mesh']
        doc, blob = validation.load_glb(path)
        primitive = doc['meshes'][0]['primitives'][0]
        channels = {key: validation.accessor(doc, blob, primitive['attributes'][name]).tolist() for key, name in [('positions', 'POSITION'), ('normals', 'NORMAL'), ('uvs', 'TEXCOORD_0')]}
        channels['indices'] = validation.accessor(doc, blob, primitive['indices']).reshape(-1).tolist()
        match = re.fullmatch(r'((?:City)?Cliffs)([ABC]{4})(\d+)', model['id'])
        family, pattern, variant = match.groups()
        groups[family].setdefault(pattern, []).append(len(templates))
        records.append(dict(id=model['id'], template=len(templates), family=family, pattern=pattern, variation=int(variant), model=model['source'], mesh=part['mesh'], meshSha256=digest(path.read_bytes()), sourceSha256=digest((source / 'SourceAssets' / Path(*PureWindowsPath(model['source']).parts)).read_bytes()), materialSha256=digest((source / part['material']).read_bytes())))
        templates.append(channels)
    for family, patterns in groups.items():
        assert len(patterns) == 64
        for pattern, ids in patterns.items():
            assert [records[i]['variation'] for i in ids] == list(range(len(ids)))
    relative = 'Assets/WarcraftIII/Models/Terrain/ClassicCliffs.mpatch'
    output(relative, dict(schemaVersion=1, columns=4, rows=4, cellSize=[2, 2], scale=2, heightStep=.5, origin=[-4, -4], templateOffset=[2, 0, 2], templates=templates))
    skins = {'winter': 'W_Cliff1', 'forest': 'Cliff1', 'barrens': 'B_Cliff0', 'masonry': 'Y_Cliff1'}
    for name, texture in skins.items():
        reference = 'Assets/WarcraftIII/Textures/ReplaceableTextures/Cliff/' + texture + '.png'
        for ref in [reference, reference + '.meta']:
            src, dst = LIBRARY / 'cliff-skins-ready' / ref, SAMPLE / ref
            raw = src.read_bytes()
            if dst.exists():
                assert dst.read_bytes() == raw or old.get(ref) == digest(dst.read_bytes()), f'Preserve modified cliff texture: {dst}'
            dst.parent.mkdir(parents=True, exist_ok=True)
            if not dst.exists() or dst.read_bytes() != raw:
                shutil.copyfile(src, dst)
            files[ref] = dict(path=ref, sha256=digest(raw), bytes=len(raw))
        material = json.loads((source / models[0]['parts'][0]['material']).read_text())
        material['name'] = 'Original cliff ' + name
        material['base_color_texture'] = reference
        output('Assets/WarcraftIII/Materials/Terrain/ClassicCliff-' + name + '.mmat', material)
    output('Assets/WarcraftIII/classic-cliff-catalog.json', dict(mesh=relative, cornerOrder=['SW', 'NW', 'NE', 'SE'], families=groups, skins={name: 'Assets/WarcraftIII/Materials/Terrain/ClassicCliff-' + name + '.mmat' for name in skins}, models=records))
    write(previous, dict(generator='scripts/import-frost-classic-cliffs.py', generatorSha256=digest(Path(__file__).read_bytes()), sourceLibrary='asset-library/warcraft-iii', sourceModels=records, sourceSkins='cliff-skins-ready', files=list(files.values()), scope='Authored templates and native composition; battlefield top surfaces and navigation integration pending'))
    print(f'Imported {len(templates)} authored cliff templates; {len(files)} runtime files')

if __name__ == '__main__':
    main()

"""Author: MiYu. Resolve every loose and UTM-embedded MDX with its original scoped textures."""
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path, PureWindowsPath
import struct
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('converter', ROOT/'scripts/convert-warcraft-assets.py')
converter = importlib.util.module_from_spec(spec);spec.loader.exec_module(converter)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--library',type=Path,default=Path('G:/work/github/MEgine/asset-library/warcraft-iii'))
parser.add_argument('--game',type=Path,default=Path(r'E:\Program Files (x86)\dzclient\Game\Warcraft III Frozen Throne'))
parser.add_argument('--out',type=Path,default=ROOT/'tmp/hive-models-export')
args=parser.parse_args();out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
archives=[];game={};archive_records=[]
for name in ['war3.mpq','War3x.mpq','War3xLocal.mpq','War3Patch.mpq']:
    archive=mpyq.MPQArchive(str(args.game/name));archives.append(archive)
    game.update({p.decode('utf-8').lower():(p.decode('utf-8'),archive) for p in archive.files})
    archive_records.append(dict(archive=name,files=len(archive.files)))
records={};models=[];failures=[];inventory=[]

def store(path,data,origin):
    rel=converter.relative(path);key=rel.as_posix().lower()
    target=out/'raw'/rel
    if key in records:
        if records[key]['sha256'] != converter.sha(data):raise ValueError(f'Conflicting texture: {path}')
        return records[key]['path']
    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    records[key]=dict(path=rel.as_posix(),bytes=len(data),sha256=converter.sha(data),origin=origin)
    return rel.as_posix()

def builtin(name):
    original,archive=game[name.lower()]
    return store('Game/'+converter.relative(original).as_posix(),read_archive(archive,original),dict(archive=Path(archive.file.name).name,path=original))

def convert_source(path,data,resolve,origin):
    inventory.append(dict(path=path,origin=origin))
    try:
        assert data[:4]==b'MDLX'
        store(path,data,origin);offset=4;aliases={};chunks=[]
        while offset<len(data):
            tag,size=struct.unpack_from('<4sI',data,offset);assert offset+8+size<=len(data);chunks.append(tag.decode('ascii'))
            if tag==b'TEXS':
                assert size%268==0
                for i in range(offset+8,offset+8+size,268):
                    replaceable=struct.unpack_from('<I',data,i)[0]
                    name=data[i+4:i+264].split(b'\0',1)[0].decode('utf-8')
                    ref=converter.REPLACEMENTS.get(replaceable,name)
                    if not ref:raise ValueError(f'Unresolved replaceable texture {replaceable}')
                    aliases[ref.lower()]=resolve(ref)
                    if replaceable in (1,2):
                        blue=ref.replace('00.blp','01.blp');aliases[blue.lower()]=builtin(blue)
            offset+=8+size
        assert offset==len(data)
        models.append(dict(path=path,chunks=chunks,textureSources=aliases,origin=origin))
    except Exception as error:
        failures.append(dict(path=path,error=str(error)))

try:
    for category in ['units','buildings','effects']:
        for pack in sorted((args.library/category).iterdir()):
            if not pack.is_dir():continue
            files=[p for p in pack.rglob('*') if p.is_file()]
            for model in sorted(p for p in files if p.suffix.lower()=='.mdx'):
                def resolve(ref):
                    rel=converter.relative(ref);suffix=rel.as_posix().lower()
                    candidates=[p for p in files if p.suffix.lower() in ('.blp','.tga','.png','.jpg','.dds') and (p.relative_to(pack).as_posix().lower().endswith(suffix) or p.name.lower()==rel.name.lower())]
                    if candidates:
                        candidates.sort(key=lambda p:(-len(set(p.parent.parts)&set(model.parent.parts)),p.as_posix()))
                        p=candidates[0]
                        return store('HIVE/'+p.relative_to(args.library).as_posix(),p.read_bytes(),dict(path=str(p),sha256=converter.sha(p.read_bytes())))
                    return builtin(ref)
                convert_source('HIVE/'+model.relative_to(args.library).as_posix(),model.read_bytes(),resolve,dict(path=str(model),sha256=converter.sha(model.read_bytes())))
    for path in sorted((args.library/'terrain').rglob('*.w3x')):
        data=path.read_bytes();offset=data.find(b'MPQ\x1a')
        if offset<0:raise ValueError(f'Map has no MPQ header: {path}')
        archive=mpyq.MPQArchive(io.BytesIO(data[offset:]),listfile=False)
        archives.append(archive)
        names=read_archive(archive,'(listfile)').decode('utf-8').splitlines()
        lookup={p.lower():p for p in names};prefix='UTM/'+path.stem+'/'
        archive_records.append(dict(archive=str(path),sha256=converter.sha(data),files=len(names),mpqOffset=offset))
        def resolve(ref):
            normalized=converter.relative(ref).as_posix().replace('/','\\').lower()
            actual=lookup.get(normalized)
            if actual is None:
                # Warcraft imports can omit war3mapImported in model texture references.
                actual=lookup.get(('war3mapImported\\'+normalized).lower())
            if actual is None:
                candidates=[p for p in names if PureWindowsPath(p).name.lower()==PureWindowsPath(ref).name.lower()]
                if len(candidates)==1:actual=candidates[0]
            if actual is not None:return store(prefix+converter.relative(actual).as_posix(),read_archive(archive,actual),dict(map=str(path),path=actual))
            return builtin(ref)
        for name in sorted(p for p in names if p.lower().endswith('.mdx')):
            try:data=read_archive(archive,name)
            except Exception as error:
                failures.append(dict(path=prefix+name,error=str(error)));continue
            convert_source(prefix+converter.relative(name).as_posix(),data,resolve,dict(map=str(path),path=name))
    manifest=dict(source=str(args.library),archives=archive_records,precedence=['pack-local','UTM-import','game-patch'],modelSamples=models,files=list(records.values()),failures=failures,selectedModels=len(inventory),remainingInventory=len(failures))
    converter.json_write(out/'manifest.json',manifest)
    converter.json_write(out/'model-inventory.json',inventory)
    (out/'terrain-preview.jpg').write_bytes((args.library/'classic/Validation/terrain-preview.jpg').read_bytes())
    converter.json_write(out/'library-sources.json',json.loads((args.library/'asset-sources.json').read_text(encoding='utf-8')))
    print(json.dumps(dict(selected=len(inventory),extracted=len(models),failures=failures,sourceFiles=len(records)),ensure_ascii=False))
finally:
    for archive in archives:archive.file.close()
if failures:raise SystemExit(1)

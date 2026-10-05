"""Author: MiYu. Extract game actors and model texture dependencies from an installed Warcraft III."""
import argparse
import hashlib
import json
from pathlib import Path, PureWindowsPath
import struct
import sys
import bz2
import zlib

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'third_party/mpyq'))
import mpyq

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--game',type=Path,default=Path(r'E:\Program Files (x86)\dzclient\Game\Warcraft III Frozen Throne'))
parser.add_argument('--library',type=Path,default=Path('G:/work/github/MEgine/asset-library/warcraft-iii/classic'))
parser.add_argument('--out',type=Path,default=ROOT/'tmp/classic-actors-export')
parser.add_argument('--all',action='store_true',help='Extract every indexed MDX, including scenery, portraits and effects')
parser.add_argument('--exclude-converted',type=Path,help='Skip model source paths already present in an engine-ready catalog')
parser.add_argument('--skip-terrain',action='store_true',help='Keep existing terrain library instead of duplicating its atlases')
args=parser.parse_args();out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
archives=[];effective={};summaries=[]
for name in ['war3.mpq','War3x.mpq','War3xLocal.mpq','War3Patch.mpq']:
    archive=mpyq.MPQArchive(str(args.game/name));archives.append(archive)
    for entry in archive.files:
        original=entry.decode('utf-8');effective[original.lower()]=(original,name,archive)
    summaries.append({'archive':name,'files':len(archive.files)})

def read(path):
    original,name,archive=effective[path.lower()];block=archive.block_table[archive.get_hash_table_entry(original).block_table_index]
    if not block.flags & (mpyq.MPQ_FILE_COMPRESS|mpyq.MPQ_FILE_IMPLODE|mpyq.MPQ_FILE_ENCRYPTED):
        archive.file.seek(archive.header['offset']+block.offset);data=archive.file.read(block.archived_size)
    elif block.flags & mpyq.MPQ_FILE_COMPRESS and not block.flags & (mpyq.MPQ_FILE_SINGLE_UNIT|mpyq.MPQ_FILE_ENCRYPTED):
        archive.file.seek(archive.header['offset']+block.offset);stored=archive.file.read(block.archived_size)
        sector_size=512<<archive.header['sector_size_shift'];count=(block.size+sector_size-1)//sector_size
        offsets=struct.unpack('<%dI'%(count+1),stored[:4*(count+1)]);parts=[]
        for i in range(count):
            expected=min(sector_size,block.size-i*sector_size);sector=stored[offsets[i]:offsets[i+1]]
            if len(sector)<expected:
                if sector[0]==2:sector=zlib.decompress(sector[1:])
                elif sector[0]==16:sector=bz2.decompress(sector[1:])
                else:raise ValueError(original+': unsupported MPQ compression mask '+str(sector[0]))
            assert len(sector)==expected,(original,i,len(sector),expected)
            parts.append(sector)
        data=b''.join(parts)
    else:
        try:data=archive.read_file(original)
        except Exception as e:raise ValueError(original+': '+str(e)) from e
    assert data is not None and len(data)==block.size,(original,len(data or b''),block.size)
    return original,name,data

records={}
def extract(path):
    original,archive,data=read(path);parts=PureWindowsPath(original)
    assert not parts.is_absolute() and all(p not in ('.','..') for p in parts.parts) and ':' not in original
    target=out/'raw'/Path(*parts.parts);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    records[original.lower()]={'path':original,'archive':archive,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    return data

# Complete regular racial production sets and heroes; neutral camps needed by melee/TD/Dota.
neutral={'direwolf','timberwolf','whitewolf','grizzlybear','polarbear','bandit','banditlord','banditmage','banditspearthrower','gnoll','gnollarcher','gnolloverseer','gnollwarden','ogre','ogrelord','ogremagi','kobold','koboldgeomancer','murloc','murlocwarrior','foresttroll','foresttrollshadowpriest','icetroll','furbolg','furbolgelder','satyr','satyrhellcaller','satyrtrickster','rockgolem','revenant','skeletonarcher','spider','red dragon','blackdragon','greendragon','azure dragon','magnataur','centaur','centaurarcher','centaurkhan','harpy','harpyqueen','pandarenbrewmaster','beastmaster','herogoblin alchemist','herotinker'}
neutral={x.replace(' ','') for x in neutral}
inventory=[{'path':v[0],'archive':v[1]} for k,v in sorted(effective.items()) if k.endswith('.mdx')]
selected=[];seen=set()
excluded={m['source'].lower() for m in json.loads(args.exclude_converted.read_text(encoding='utf-8'))['models']} if args.exclude_converted else set()
for entry in inventory:
    p=entry['path'].lower();parts=PureWindowsPath(p).parts;stem=PureWindowsPath(p).stem
    racial=len(parts)>2 and parts[0] in ('units','buildings') and parts[1] in ('human','orc','nightelf','undead')
    regular=not any(word in stem for word in ['portrait','_v1','explos','ball','sphere','missile','cloud','cin','ship','boat','ghost','ward','totem','phoenixegg']) and stem not in {'ubirth','locust','scarab','knightnorider','kotobeastnorider','riderlesswyvern','owl','owlscout','runner','ancestralguardian','stasis','wispexplode'}
    creep=len(parts)>2 and parts[:2]==('units','creeps') and stem in neutral
    tree=p==r'doodads\terrain\lordaerontree\lordaerontree0.mdx'
    if p in excluded:continue
    if args.all or (((racial and regular) or creep or tree) and stem not in seen):
        selected.append(entry);seen.add(stem)
models=[];failures=[]
replacements={1:r'ReplaceableTextures\TeamColor\TeamColor00.blp',2:r'ReplaceableTextures\TeamGlow\TeamGlow00.blp',31:r'ReplaceableTextures\LordaeronTree\LordaeronSummerTree.blp'}
replacements.update({11:r'ReplaceableTextures\Cliff\Cliff1.blp',32:r'ReplaceableTextures\AshenvaleTree\AshenTree.blp',33:r'ReplaceableTextures\BarrensTree\BarrensTree.blp',34:r'ReplaceableTextures\NorthrendTree\NorthTree.blp',35:r'ReplaceableTextures\Mushroom\MushroomTree.blp',36:r'ReplaceableTextures\RuinsTree\RuinsTree.blp',37:r'ReplaceableTextures\OutlandMushroomTree\MushroomTree.blp'})
try:
    for entry in selected:
        try:
            data=extract(entry['path']);assert data[:4]==b'MDLX';offset=4;chunks=[];textures=[];aliases={}
            while offset<len(data):
                tag,size=struct.unpack_from('<4sI',data,offset);assert offset+8+size<=len(data);chunks.append(tag.decode('ascii'))
                if tag==b'TEXS':
                    assert size%268==0
                    for item in range(offset+8,offset+8+size,268):
                        replaceable=struct.unpack_from('<I',data,item)[0];texture=data[item+4:item+264].split(b'\0',1)[0].decode('utf-8');replacement=replacements.get(replaceable)
                        if replaceable==21 and entry['path'].lower().startswith('ui\\cursor\\'):
                            replacement=str(PureWindowsPath(entry['path']).with_suffix('.blp'));aliases[texture]=replacement
                        # The shipped BloodSphere retains author-machine TGA paths; the same
                        # named textures are distributed as BLPs in the effective game archive.
                        if str(PureWindowsPath(texture)).lower().startswith(r'\\guldan\drive1\projects\war3\artinprogress') and PureWindowsPath(texture).stem.lower() in {'star5tga','bloodelfballz','zap1_red','clouds8x8modblight','clouds8x8'}:
                            replacement='Textures\\'+PureWindowsPath(texture).stem+'.blp';aliases[texture]=replacement
                        textures.append({'path':texture,'replaceable':replaceable,'previewReplacement':replacement})
                        dependency=replacement or texture
                        if not dependency:raise ValueError('Unresolved replaceable texture '+str(replaceable))
                        if dependency.lower() not in records:extract(dependency)
                        if replaceable in (1,2):
                            blue=dependency.replace('00.blp','01.blp')
                            if blue.lower() not in records:extract(blue)
                offset+=8+size
            assert offset==len(data)
            models.append({'path':entry['path'],'chunks':chunks,'textures':textures,'textureSources':aliases})
        except Exception as e:failures.append({'path':entry['path'],'error':str(e)})
    for path in sorted(effective):
        if not args.skip_terrain and path.startswith('terrainart\\') and path.endswith('.blp') and path not in records:extract(path)
    (out/'model-inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
    # The converter retains this contact sheet for provenance, rather than fabricating a new preview.
    preview=args.library/'Validation/terrain-preview.jpg'
    (out/'terrain-preview.jpg').write_bytes(preview.read_bytes())
    manifest={'source':str(args.game),'archives':summaries,'precedence':[x['archive'] for x in summaries],'modelSamples':models,'files':list(records.values()),'failures':failures,'selectedModels':len(selected),'previouslyConvertedModels':len(excluded),'remainingInventory':len(inventory)-len(models)-len(excluded)}
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in manifest.items() if k not in ('files','modelSamples')},ensure_ascii=False))
finally:
    for archive in archives:archive.file.close()
if failures:sys.exit(1)

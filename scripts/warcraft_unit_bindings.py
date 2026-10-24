"""Author: MiYu. Source unit definitions, placement identities and selection assets for original-map instances."""
import configparser
import hashlib
import importlib
import io
import json
import math
import struct
from pathlib import Path
from warcraft_selection_ground import ground_triangles, selection_patch

rows = importlib.import_module('import-frost-wisp-rules').rows
converter = importlib.import_module('convert-warcraft-assets')
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def ini(raw):
    result = configparser.ConfigParser(strict=False, interpolation=None, inline_comment_prefixes=('//',), allow_no_value=True)
    result.optionxform = str
    result.read_string(raw.decode('utf-8-sig'))
    return result


def model_bounds(raw):
    if raw[:4] != b'MDLX': raise ValueError('Expected source MDX bounds')
    offset = 4
    while offset < len(raw):
        tag, length = struct.unpack_from('<4sI', raw, offset)
        if offset+8+length > len(raw): raise ValueError('Truncated source model')
        if tag == b'MODL':
            if length < 368: raise ValueError('Truncated source model bounds')
            radius, x0, y0, z0, x1, y1, z1 = struct.unpack_from('<7f', raw, offset+8+340)
            if not all(math.isfinite(v) for v in [radius,x0,y0,z0,x1,y1,z1]) or any(a > b for a,b in [(x0,x1),(y0,y1),(z0,z1)]): raise ValueError('Invalid source model bounds')
            return dict(min=[x0/128,z0/128,-y1/128], max=[x1/128,z1/128,-y0/128])
        offset += 8+length
    raise ValueError('Missing source model bounds')


def build_bindings(data, source_read, project, prefix='Assets/OriginalUnits/Selection/', resource_cache=None, ground_meshes=(), definitions=None):
    sources = {}; object_definitions = definitions
    def read(name):
        raw = source_read(name); sources[name] = dict(path=name,sha256=sha(raw),bytes=len(raw)); return raw
    ui = definitions['ui'] if definitions else rows(read('Units/UnitUI.slk')); balance = definitions['balance'] if definitions else rows(read('Units/UnitBalance.slk')); movement = definitions['movement'] if definitions else rows(read('Units/UnitData.slk'))
    placements = [dict(index=i,creationNumber=u['creationNumber'],typeId=u['id'],player=u['player'],sourcePosition=u['location'][:2],facing=u['angle']*180/math.pi,name=f'Unit-{i}-{u["id"]}-{u["creationNumber"]}') for i,u in enumerate(data['units']['units']) if u['id'] != 'sloc']
    kinds = {p['typeId'] for p in placements}; names = {kind:name for kind,name in (definitions or {}).get('names',{}).items() if kind in kinds}
    aliases = (definitions or {}).get('aliases',{})
    for race in ['Neutral','Human','Orc','Undead','NightElf','Campaign','Item']:
        if kinds <= names.keys(): break
        strings = ini(read('Units/'+race+('Strings.txt' if race == 'Item' else 'UnitStrings.txt')))
        for kind in kinds-names.keys():
            source_kind = aliases.get(kind,kind)
            if strings.has_option(source_kind,'Name'): names[kind] = strings[source_kind]['Name'].strip('"')
    if not kinds <= names.keys(): raise ValueError('Missing source unit display names')
    def number(row,key,default=0):
        value = row.get(key,'-').strip(); result = default if value in ('','-','_') else float(value)
        if not math.isfinite(result): raise ValueError('Non-finite unit field '+key)
        return result
    definitions = {}
    for kind in sorted(kinds):
        row,stats = ui[kind],balance[kind]; model = row['file'].replace('\\','/')
        if model.lower().endswith(('.mdl','.mdx')): model=model[:-4]
        definitions[kind] = dict(name=names[kind],maxLife=number(stats,'HP'),maxMana=number(stats,'manaN'),initialMana=number(stats,'mana0'),selectionScale=number(row,'scale'),selectionZ=number(row,'selZ')/128,moveHeight=number(movement[kind],'moveHeight')/128,bounds=model_bounds(read(model+'.mdx')))
        if definitions[kind]['selectionScale'] <= 0 or definitions[kind]['maxLife'] <= 0: raise ValueError('Invalid unit selection or life definition '+kind)
    misc = ini(read('UI/MiscData.txt'))['SelectionCircle']; sizes = []
    project = Path(project)
    def write(relative,raw):
        file=project/relative; file.parent.mkdir(parents=True,exist_ok=True); file.write_bytes(raw)
    encode = lambda value:(json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode('utf-8')
    for i in range(int(misc['NumSizes'])):
        suffix=f'{i:02}'; member=misc['Texture'+suffix].replace('\\','/')+'.blp'; raw=read(member)
        def convert():
            output=io.BytesIO();converter.decode_texture(raw).save(output,format='PNG');return output.getvalue()
        png=resource_cache.produce('unit-selection-texture',[sha(raw)],convert) if resource_cache else convert()
        texture=prefix+'circle-'+suffix+'.png';material=prefix+'circle-'+suffix+'.mmat';write(texture,png)
        write(material,encode(dict(version=8,name='Warcraft selection '+suffix,shader='unlit',surface='transparent',blend_mode='alpha',base_color=[1,1,1,1],base_color_texture=texture,double_sided=True,transparent_depth_write=False,render_queue=3000,wrap_u='clamp',wrap_v='clamp')))
        sizes.append(dict(maxSize=float(misc['Size'+suffix]) if 'Size'+suffix in misc else None,material=material))
    mesh=prefix+'circle.glb';glb=converter.Glb();glb.mesh([[-.5,0,-.5],[.5,0,-.5],[.5,0,.5],[-.5,0,.5]],[[0,1,0]]*4,[[0,0],[1,0],[1,1],[0,1]],[0,2,1,0,3,2]);glb.save(project/mesh)
    triangles=[];ground_sources=[]
    for path,raw in ground_meshes:
        triangles.extend(ground_triangles(raw));ground_sources.append(dict(path=path,sha256=sha(raw)))
    for p in placements:
        size=definitions[p['typeId']]['selectionScale']*float(misc['ScaleFactor'])/128
        positions,uvs,indices=selection_patch(triangles,p['sourcePosition'][0]/128,-p['sourcePosition'][1]/128,size)
        if not indices:continue
        p['selectionMesh']=prefix+'ground-'+str(p['index'])+'.glb';glb=converter.Glb();glb.mesh(positions,[[0,1,0]]*len(positions),uvs,indices);glb.save(project/p['selectionMesh'])
    colors={}
    for key in ['Friend','Neutral','Enemy']:
        a,r,g,b=map(int,misc['Color'+key].split(','));colors[key.lower()]=[r/255,g/255,b/255,a/255]
    players=sorted((p for p in (data.get('info') or {}).get('players',[]) if p['type']==1),key=lambda p:p['id'])
    tools=[dict(path='scripts/'+p.name,sha256=sha(p.read_bytes())) for p in [Path(__file__),Path(converter.__file__),Path(__file__).with_name('warcraft_selection_ground.py')]]
    result=dict(version=1,mapSha256=data['source']['sha256'],sourceSha256=data['source']['members'].get('war3mapUnits.doo',{}).get('sha256'),placements=placements,definitions=definitions,localPlayer=players[0]['id'] if players else 0,selection=dict(mesh=mesh,scaleFactor=float(misc['ScaleFactor']),sizes=sizes,colors=colors),sources=list(sources.values()),tools=tools)
    if object_definitions is not None: result['objectOverrides'] = object_definitions['overrides']
    result['selection']['groundSources']=ground_sources
    write('Assets/Data/OriginalUnitBindings.json',encode(result));return result


def add_selection_entity(scene, bindings):
    entities=scene['world']['entities']; found=[e for e in entities if e.get('name')=='Map unit selection']
    if len(found)>1: raise ValueError('Duplicate unit selection entity')
    if found: return
    entities.append(dict(entity=max(e['entity'] for e in entities)+1,name='Map unit selection',active=False,components=dict(Transform=dict(position=[0,0,0],rotation=[0,0,0,1],scale=[1,1,1]),MeshRenderer=dict(mesh=bindings['selection']['mesh'],material=bindings['selection']['sizes'][0]['material']),MaterialPropertyBlock=dict(override_base_color=True,base_color=[1,1,1,1]))))

"""Author: MiYu. Reproduce signed original Demon Hunter geometry, portraits, icons and rules."""
import argparse
import importlib
import json
import pathlib
import re
import subprocess
import struct
import sys
import tempfile

base=importlib.import_module('import-frost-druids')
camera=importlib.import_module('import-frost-dryad-portrait')
ROOT,SAMPLE,sha,encode=base.ROOT,base.SAMPLE,base.sha,base.encode
BINDINGS=[dict(key='ClassicDemonHunter',source='HeroDemonHunter',pack='game-ready',model='Units/NightElf/HeroDemonHunter/HeroDemonHunter.mdx'),dict(key='ClassicDemonHunterPortrait',source='HeroDemonHunter_Portrait',pack='remaining-ready',model='Units/NightElf/HeroDemonHunter/HeroDemonHunter_Portrait.mdx',environment=True)]
SPELLS=[('ManaBurnTarget','NightElf/ManaBurn'),('ImmolationTarget','NightElf/Immolation'),('ImmolationDamage','NightElf/Immolation')]
BINDINGS += [dict(key='ClassicDH'+n,source=n,pack='remaining-ready',model=f'Abilities/Spells/{d}/{n}.mdx',environment=True) for n,d in SPELLS if n!='ImmolationDamage']+[dict(key='ClassicDHMissile',source='DemonHunterMissile',pack='remaining-ready',model='Abilities/Weapons/DemonHunterMissile/DemonHunterMissile.mdx',environment=True)]

def portrait(raw):
 offset=4;chunks=[];tracks=[]
 while offset<len(raw):
  tag,length=struct.unpack_from('<4sI',raw,offset);offset+=8;data=raw[offset:offset+length];offset+=length
  if tag==b'CAMS':
   size=struct.unpack_from('<I',data)[0];assert size==len(data);cursor=120;values=list(struct.unpack_from('<9f',data,84))
   while cursor<size:
    kind,count,interpolation,sequence=struct.unpack_from('<4sIIi',data,cursor);cursor+=16;dim=1 if kind==b'KCRL' else 3
    assert kind in [b'KCTR',b'KTTR',b'KCRL'] and interpolation in range(4) and sequence==-1
    keys=[]
    for _ in range(count):
     frame=struct.unpack_from('<I',data,cursor)[0];cursor+=4;v=struct.unpack_from('<'+str(dim*(3 if interpolation>1 else 1))+'f',data,cursor);cursor+=4*len(v);keys.append(dict(frame=frame,values=list(v)))
    assert keys;tracks.append(dict(kind=kind.decode(),interpolation=interpolation,keys=keys))
    if kind==b'KCRL':assert keys[0]['values'][0]==0,'Nonzero portrait camera roll needs conversion'
    else:
     start=0 if kind==b'KCTR' else 6
     for i in range(3):values[start+i]+=keys[0]['values'][i]
   data=struct.pack('<I',120)+data[4:84]+struct.pack('<9f',*values)
  chunks.append(struct.pack('<4sI',tag,len(data))+data)
 return dict(**camera.convert(b'MDLX'+b''.join(chunks)),sourceCameraTracks=tracks,cameraSampleFrame=0)

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--output',type=pathlib.Path,default=SAMPLE)
 parser.add_argument('--game',type=pathlib.Path,default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
 parser.add_argument('--pose-probe',type=pathlib.Path,default=pathlib.Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'))
 parser.add_argument('--metadata-reader',type=pathlib.Path,default=ROOT/'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
 parser.add_argument('--sampler',type=pathlib.Path,default=ROOT/'tmp/warcraft-effects/sentinel-bin/MdxExport.dll')
 args=parser.parse_args();files,sources,archives={},[],[]
 def run(script,*params):subprocess.run([sys.executable,str(ROOT/'scripts'/script),*map(str,params)],check=True)
 def original(path):
  if not archives:archives.extend((n,base.mpyq.MPQArchive(str(args.game/n),listfile=False)) for n in ['war3.mpq','War3x.mpq','War3xLocal.mpq','War3Patch.mpq'])
  for name,archive in reversed(archives):
   try:raw=base.read_archive(archive,path.replace('/','\\'));break
   except FileNotFoundError:continue
  else:raise ValueError('Missing original Demon Hunter source: '+path)
  path=path.replace('\\','/');files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,archive=name,bytes=len(raw),sha256=sha(raw)));return raw
 with tempfile.TemporaryDirectory(prefix='frost-demon-hunter-') as temp:
  work=pathlib.Path(temp);geometry=work/'geometry';geometry.mkdir();(geometry/'model-catalog.json').write_bytes(encode({}))
  bindings=work/'bindings.json';bindings.write_bytes(encode(dict(models=BINDINGS)));overlay=work/'overlay'
  run('convert-frost-classic-billboards.py','--bindings',bindings,'--output',overlay,'--metadata-reader',args.metadata_reader)
  run('import-frost-classic.py','--bindings',bindings,'--output',geometry,'--keys',*[r['key'] for r in BINDINGS],'--billboard-library',overlay,'--pose-probe',args.pose_probe)
  receipt=json.loads((geometry/'classic-sources.json').read_bytes())
  for record in receipt['files']:
   raw=(geometry/record['path']).read_bytes();assert sha(raw)==record['sha256'] and len(raw)==record['bytes']
   target=record['path'].replace('Assets/WarcraftIII/','Assets/DemonHunter/')
   if target.endswith('.mmat'):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/DemonHunter/')
   files[target]=raw
  files['demon-hunter-models.json']=(geometry/'model-catalog.json').read_bytes().replace(b'Assets/WarcraftIII/',b'Assets/DemonHunter/')
  files['SourceAssets/DemonHunter/node-conversion.json']=(overlay/'asset-sources.json').read_bytes();views={}
  for binding in BINDINGS:
   library=ROOT/'asset-library/warcraft-iii'/binding['pack'];signed=json.loads((library/'asset-sources.json').read_bytes())
   record=next(r for r in signed['sourceFiles'] if r['path'].replace('\\','/').lower()==binding['model'].lower());path=record['path'].replace('\\','/');raw=(library/'SourceAssets'/path).read_bytes()
   assert sha(raw)==record['sha256'] and len(raw)==record['bytes'];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(record,path=path,pack=binding['pack']))
   if binding['key'].endswith('Portrait'):views[binding['key']]=dict(source=path,sourceSha256=sha(raw),**portrait(raw))
  files['demon-hunter-portraits.json']=encode(views)
  effects=work/'effects';run('convert-warcraft-effects.py','--output',effects,'--sampler',args.sampler,*[v for n,d in SPELLS for v in ['--source',f'remaining-ready/Abilities/Spells/{d}/{n}.mdx']])
  effect_receipt=json.loads((effects/'asset-sources.json').read_bytes())
  for record in effect_receipt['generatedFiles']:
   if not record['path'].startswith('Assets/') or record['path'].endswith('effect-catalog.json'):continue
   raw=(effects/record['path']).read_bytes();assert sha(raw)==record['sha256'];target=record['path'].replace('Assets/WarcraftIII/','Assets/DemonHunter/')
   if target.endswith(('.meffect','.json')):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/DemonHunter/')
   files[target]=raw
  meshes=json.loads(files['demon-hunter-models.json']);art={}
  for effect in json.loads((effects/'Assets/WarcraftIII/effect-catalog.json').read_bytes())['models']:
   name=pathlib.PureWindowsPath(effect['source']).stem
   mesh=meshes.get('ClassicDH'+name) or dict(parts=[],animations=[dict(name=c['name'],frames=c['frames'],duration=c['duration'],loop=c['loop']) for c in effect['clips']])
   assert [c['name'] for c in effect['clips']]==[c['name'] for c in mesh['animations']]
   art[name]=dict(effect=effect['effect'].replace('Assets/WarcraftIII/','Assets/DemonHunter/'),parts=mesh['parts'],animations=mesh['animations'])
  files['demon-hunter-art.json']=encode(art);files['SourceAssets/DemonHunter/effect-conversion.json']=encode(effect_receipt)
  for r in effect_receipt['sourceFiles']:
   raw=(effects/'SourceAssets'/r['path']).read_bytes();assert sha(raw)==r['sha256'] and len(raw)==r['bytes'];path=r['path'].split('/',1)[1];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,pack=r['path'].split('/',1)[0],sha256=r['sha256'],bytes=r['bytes']))
 tables={n:base.rows(original('Units/'+n+'.slk')) for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI','AbilityData','AbilityMetaData']}
 texts={n:original('Units/NightElf'+n+'.txt') for n in ['UnitFunc','UnitStrings','AbilityFunc','AbilityStrings']}
 elf=original('Scripts/elf.ai');original('Scripts/common.ai');misc=original('Units/MiscGame.txt');original('UI/WorldEditStrings.txt');original('UI/UnitEditorData.txt')
 def icons(key,path):
  result={}
  for field,source in [('icon',path),('disabledIcon',path.replace('\\CommandButtons\\BTN','\\CommandButtonsDisabled\\DISBTN'))]:
   raw=original(source);target='Assets/Art/classic-dh-'+key+('-disabled' if field=='disabledIcon' else '')+'.png';files[target]=base.base.decode_icon(raw);result[field]=target
  return result
 number=lambda value:float(value) if value.strip() not in ['-','_',''] else 0
 units={}
 for key in ['Edem','Edmm']:
  b,w,ui=[tables[n][key] for n in ['UnitBalance','UnitWeapons','unitUI']];f=base.section(texts['UnitFunc'],key)
  weapon=dict(damage=number(w['avgdmg1']),dice=int(w['dice1']),sides=int(w['sides1']),bonus=number(w['dmgplus1']),attack=w['atkType1'],range=number(w['rangeN1'])/100,cooldown=number(w['cool1']),damagePoint=number(w['dmgpt1']),backswing=number(w['backSw1']),missileSpeed=number(f.get('Missilespeed','0'))/100,antiAir='air' in w['targs1'].split(','))
  if key=='Edmm':weapon['splashBands']=[[number(w['Farea1'])/100,1],[number(w['Harea1'])/100,number(w['Hfact1'])],[number(w['Qarea1'])/100,number(w['Qfact1'])]]
  else:weapon['missileSpeed']=0
  units[key]=dict(sourceUnit=key,label='Demon Hunter',model='ClassicDemonHunter',portrait='ClassicDemonHunterPortrait',baseHp=number(b['HP']),baseMana=number(b['manaN']),initialMana=number(b['mana0']),baseArmor=number(b['def']),strength=number(b['STR']),agility=number(b['AGI']),intelligence=number(b['INT']),strengthGrowth=number(b['STRplus']),agilityGrowth=number(b['AGIplus']),intelligenceGrowth=number(b['INTplus']),primary=b['Primary'],armor=b['defType'],gold=int(b['goldcost']),wood=int(b['lumbercost']),food=number(b['fused']),time=number(b['bldtm']),speed=number(b['spd'])/100,collision=number(b['collision'])/100,nightRegen=number(b['regenHP']),manaRegen=number(b['regenMana']),modelScale=number(ui['modelScale']),selectionScale=number(ui['scale']),sourceRows={n:tables[n][key] for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI']},sourceFunc=f,sourceStrings=base.section(texts['UnitStrings'],key),weapon=weapon,**icons(key,f['Art']))
 abilities={}
 for key in ['AEmb','AEim','AEev','AEme']:
  row=tables['AbilityData'][key];f=base.section(texts['AbilityFunc'],key)
  abilities[key]=dict(sourceRow=row,sourceFunc=f,sourceStrings=base.section(texts['AbilityStrings'],key),levels=[dict(cost=number(row['Cost'+str(n)]),cooldown=number(row['Cool'+str(n)]),range=number(row['Rng'+str(n)])/100,radius=number(row['Area'+str(n)])/100,power=number(row['DataA'+str(n)]) if key!='AEme' else 0) for n in range(1,int(row['levels'])+1)],**icons(key,f['Art']))
  if key=='AEim':abilities[key]['offIcon']=icons('immolation-off',f['Unart'])['icon']
 skill_builds={};skill={};slots={'MANA_BURN':0,'IMMOLATION':1,'EVASION':2,'METAMORPHOSIS':3}
 for line in elf.decode('utf8').splitlines():
  match=re.match(r'\s*set skill\[\s*(\d+)\]\s*=\s*(\w+)',line)
  if match:skill[int(match[1])]=match[2]
  match=re.match(r'\s*call SetSkillArray\(([12]),DEMON_HUNTER\)',line)
  if match:skill_builds['first' if match[1]=='1' else 'later']=[slots[skill[n]] for n in range(1,11)]
 assert set(skill_builds)=={'first','later'}
 files['demon-hunter-rules.json']=encode(dict(author='MiYu',schemaVersion=1,units=units,abilities=abilities,skillBuilds=skill_builds,misc=base.section(misc,'Misc'),originalRuntimeVerified=False,unverified=['Original attribute rounding and full attack-speed behavior','Original cast and transform runtime timing','Metamorphosis current HP adjustment and reversion','Immolation mana-buffer timing','Damage and evasion interaction with shields, orbs and splash','Original experience award parity']))
 files['Assets/DemonHunter/.gitattributes']=b'* -text whitespace=cr-at-eol\n'
 files['Assets/Licenses/Classic-DemonHunter.txt']=b'Original Warcraft III assets and rules belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source hashes and generators: demon-hunter-sources.json.\n'
 tools=['scripts/import-frost-demon-hunter.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-dryad-portrait.py','scripts/convert-warcraft-effects.py']
 receipt=dict(author='MiYu',generatorHashMode='lf-text',generators={p:sha((ROOT/p).read_bytes().replace(b'\r\n',b'\n')) for p in tools},poseProbeSha256=sha(args.pose_probe.read_bytes()),sources=sources,files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())]);output=args.output.resolve();receipt_path=output/'demon-hunter-sources.json';previous=json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {};old={r['path']:r['sha256'] for r in previous.get('files',[])}
 for p,raw in files.items():
  target=output/p;assert not target.exists() or target.read_bytes()==raw or sha(target.read_bytes())==old.get(p),'Preserve modified Demon Hunter output: '+p
 for p,raw in files.items():
  target=output/p;target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists() or target.read_bytes()!=raw:target.write_bytes(raw)
 receipt_path.write_bytes(encode(receipt));print('PASS original Demon Hunter source import:',len(files),'signed outputs')

if __name__=='__main__':main()

"""Author: MiYu. Reproduce signed original Blood Mage geometry, portraits, icons and rules."""
import argparse
import importlib
import io
import json
import pathlib
import re
import subprocess
import struct
import sys
import tempfile
import time
from PIL import Image

base=importlib.import_module('import-frost-druids')
portrait=importlib.import_module('import-frost-demon-hunter').portrait
ROOT,SAMPLE,sha,encode=base.ROOT,base.SAMPLE,base.sha,base.encode
ACTORS=[dict(key='ClassicBloodMage',source='HeroBloodElf',pack='game-ready',model='Units/Human/HeroBloodElf/HeroBloodElf.mdx'),dict(key='ClassicBloodMagePortrait',source='HeroBloodElf_Portrait',pack='remaining-ready',model='Units/Human/HeroBloodElf/HeroBloodElf_Portrait.mdx',environment=True),dict(key='ClassicPhoenix',source='Phoenix',pack='game-ready',model='Units/Human/Phoenix/Phoenix.mdx'),dict(key='ClassicPhoenixPortrait',source='Phoenix_Portrait',pack='remaining-ready',model='Units/Human/Phoenix/Phoenix_Portrait.mdx',environment=True),dict(key='ClassicPhoenixEggPortrait',source='PhoenixEgg_Portrait',pack='remaining-ready',model='Units/Human/Phoenix/PhoenixEgg_Portrait.mdx',environment=True)]
SPELLS=[(n,'Abilities/Spells/Human/FlameStrike/'+n+'.mdx') for n in ['FlameStrike','FlameStrike1','FlameStrike2','FlameStrikeDamageTarget','FlameStrikeEmbers','FlameStrikeTarget']]+[('BanishTarget','Abilities/Spells/Human/Banish/BanishTarget.mdx'),('ManaDrainCaster','Abilities/Spells/Other/Drain/ManaDrainCaster.mdx'),('ManaDrainTarget','Abilities/Spells/Other/Drain/ManaDrainTarget.mdx'),('MarkOfChaosTarget','Abilities/Spells/Human/MarkOfChaos/MarkOfChaosTarget.mdx'),('BloodElfMissile','Abilities/Weapons/BloodElfMissile/BloodElfMissile.mdx'),('Phoenix_Missile','Abilities/Weapons/PhoenixMissile/Phoenix_Missile.mdx'),('Phoenix_Missile_mini','Abilities/Weapons/PhoenixMissile/Phoenix_Missile_mini.mdx'),('BloodElfBall','Units/Human/HeroBloodElf/BloodElfBall.MDX')]
# MiYu: meshless spell effects remain sampled effects; only signed geometry enters the mesh catalogue.
remaining=json.loads((ROOT/'asset-library/warcraft-iii/remaining-ready/Assets/WarcraftIII/model-catalog.json').read_bytes())
geometry_sources={m['source'].replace('\\','/').lower() for m in remaining['models'] if m['parts']}
BINDINGS=ACTORS+[dict(key='ClassicBloodMage'+n,source=n,pack='remaining-ready',model=p,environment=True) for n,p in SPELLS if p.lower() in geometry_sources]

import_portrait=importlib.import_module('import-frost-paladin').import_portrait

def safe_section(raw,key):
 try:return base.section(raw.removeprefix(b'\xef\xbb\xbf'),key)
 except TypeError:return {}

def decode_texture(raw):
 """Retain source BLP dimensions, BGRA channels and alpha for non-icon textures."""
 assert raw[:4]==b'BLP1'
 width,height=struct.unpack_from('<2I',raw,12)
 if struct.unpack_from('<I',raw,4)[0]==0:
  header,offset,size=[struct.unpack_from('<I',raw,p)[0] for p in [156,28,92]]
  image=Image.open(io.BytesIO(raw[160:160+header]+raw[offset:offset+size]));image.tile=[image.tile[0]._replace(args=(image.mode,image.mode))];image.load();planes=image.split()
  alpha=planes[3] if len(planes)==4 and struct.unpack_from('<I',raw,8)[0] else Image.new('L',image.size,255)
  image=Image.merge('RGBA',(planes[2],planes[1],planes[0],alpha))
 else:image=Image.open(io.BytesIO(raw)).convert('RGBA')
 assert image.size==(width,height)
 output=io.BytesIO();image.save(output,format='PNG');return output.getvalue()

def preserve_outputs(files,output,old):
 for p,raw in files.items():
  target=output/p;assert not target.exists() or target.read_bytes()==raw or sha(target.read_bytes())==old.get(p),'Preserve modified BloodMage output: '+p

def actor_effect(binding,sampler,work,files):
 effects=importlib.import_module('convert-warcraft-effects');converter=effects.converter
 library=ROOT/'asset-library/warcraft-iii'/binding['pack'];receipt=json.loads((library/'asset-sources.json').read_bytes())
 sources={r['path'].replace('\\','/').lower():r for r in receipt['sourceFiles']};generated={r['path'].lower():r for r in receipt['generatedFiles']}
 record=sources[binding['model'].lower()];source=library/'SourceAssets'/record['path'].replace('\\','/');assert sha(source.read_bytes())==record['sha256']
 sampled=work/(binding['key']+'-embedded.json');subprocess.run(['dotnet',str(sampler),'--effects',str(source),str(sampled)],check=True)
 data=json.loads(sampled.read_bytes());textures=data['sourceModel']['textures']
 for material in data['materials']:
  tid=material['textureId'];texture=textures[tid] if 0<=tid<len(textures) else {};replace=material['replaceableId'] or texture.get('replaceableId',0);name=converter.REPLACEMENTS.get(replace,texture.get('fileName','')).replace('\\','/')
  assert name,name
  texture_source=sources[name.lower()];png='Assets/WarcraftIII/Textures/'+pathlib.PureWindowsPath(texture_source['path']).with_suffix('.png').as_posix();signed=generated[png.lower()];raw=(library/signed['path']).read_bytes();assert sha(raw)==signed['sha256']
  target=png.replace('Assets/WarcraftIII/','Assets/BloodMage/Embedded/');files[target]=raw;material['texture']=target
 effect='Assets/BloodMage/Embedded/'+binding['key']+'.mfx';files[effect]=encode(data)
 import uuid
 files[effect+'.meta']=encode(dict(schemaVersion=1,guid=str(uuid.uuid5(uuid.NAMESPACE_URL,'mengine/frostbound/'+effect)),importer='sampled-effect'))
 files['SourceAssets/BloodMage/'+binding['key']+'-embedded-sampler.json']=encode(dict(source=binding['model'],pack=binding['pack'],sourceSha256=record['sha256'],samplerSha256=sha(sampler.read_bytes()),coreSha256=sha((sampler.parent/'Wc3ModelViewer.Core.dll').read_bytes())))
 return dict(effect=effect,parts=[],animations=[dict(name=c['name'],frames=len(c['frames']),duration=c['duration'],loop=c['loop']) for c in data['clips']],embedded=True,sourceModel=binding['model'])

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--output',type=pathlib.Path,default=SAMPLE)
 parser.add_argument('--game',type=pathlib.Path,default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
 parser.add_argument('--pose-probe',type=pathlib.Path,default=pathlib.Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'))
 parser.add_argument('--metadata-reader',type=pathlib.Path,default=ROOT/'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
 parser.add_argument('--sampler',type=pathlib.Path,default=ROOT/'tmp/warcraft-effects/sentinel-bin/MdxExport.dll')
 args=parser.parse_args();files,sources,archives={},[],[];started=time.perf_counter();output=args.output.resolve();receipt_path=output/'blood-mage-sources.json';previous=json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {};old={r['path']:r['sha256'] for r in previous.get('files',[])}
 def run(script,*params):subprocess.run([sys.executable,str(ROOT/'scripts'/script),*map(str,params)],check=True)
 def original(path):
  normalized=path.replace('\\','/');existing=files.get('SourceAssets/WarcraftIII/'+normalized)
  if existing is not None:return existing
  if not archives:archives.extend((n,base.mpyq.MPQArchive(str(args.game/n),listfile=False)) for n in ['war3.mpq','War3x.mpq','War3xLocal.mpq','War3Patch.mpq'])
  for name,archive in reversed(archives):
   try:raw=base.read_archive(archive,path.replace('/','\\'));break
   except FileNotFoundError:continue
  else:raise ValueError('Missing original BloodMage source: '+path)
  path=path.replace('\\','/');files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,archive=name,bytes=len(raw),sha256=sha(raw)));return raw
 tables={n:base.rows(original('Units/'+n+'.slk')) for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI','AbilityData','AbilityMetaData','AbilityBuffData']}
 texts={n:original('Units/Human'+n+'.txt') for n in ['UnitFunc','UnitStrings','AbilityFunc','AbilityStrings']}
 common_buff=original('Units/CommonAbilityFunc.txt');common_strings=original('Units/CommonAbilityStrings.txt');neutral_func=original('Units/NeutralAbilityFunc.txt');neutral_strings=original('Units/NeutralAbilityStrings.txt');human=original('Scripts/human.ai');original('Scripts/common.ai');misc=original('Units/MiscGame.txt');original('UI/WorldEditStrings.txt');original('UI/UnitEditorData.txt')
 def icons(key,path):
  result={}
  for field,source in [('icon',path),('disabledIcon',path.replace('\\CommandButtons\\BTN','\\CommandButtonsDisabled\\DISBTN').replace('\\PassiveButtons\\PASBTN','\\CommandButtonsDisabled\\DISPASBTN'))]:
   raw=original(source);target='Assets/Art/classic-blood-mage-'+key+('-disabled' if field=='disabledIcon' else '')+'.png';files[target]=base.base.decode_icon(raw);result[field]=target
  return result
 number=lambda value:float(value) if value.strip() not in ['-','_',''] else 0
 units={}
 for key in ['Hblm','hphx','hpxe']:
  b,w,ui=[tables[n][key] for n in ['UnitBalance','UnitWeapons','unitUI']];text=texts;f=safe_section(text['UnitFunc'],key)
  weapon=dict(damage=number(w['avgdmg1']),dice=int(number(w['dice1'])),sides=int(number(w['sides1'])),bonus=number(w['dmgplus1']),attack=w['atkType1'],range=number(w['rangeN1'])/100,cooldown=number(w['cool1']),damagePoint=number(w['dmgpt1']),backswing=number(w['backSw1']),missileSpeed=number(f.get('Missilespeed','0'))/100,antiAir='air' in w['targs1'].split(','),enabled=number(w['weapsOn'])>0,fullDamageRadius=number(w.get('Farea1','0'))/100,halfDamageRadius=number(w.get('Harea1','0'))/100,quarterDamageRadius=number(w.get('Qarea1','0'))/100,splashHalf=number(w.get('Hfact1','0')),splashQuarter=number(w.get('Qfact1','0')))
  units[key]=dict(sourceUnit=key,label={'Hblm':'Blood Mage','hphx':'Phoenix','hpxe':'Phoenix Egg'}[key],model='ClassicBloodMage' if key=='Hblm' else 'ClassicPhoenix',portrait={'Hblm':'ClassicBloodMagePortrait','hphx':'ClassicPhoenixPortrait','hpxe':'ClassicPhoenixEggPortrait'}[key],alternate=key=='hpxe',baseHp=number(b['HP']),baseMana=number(b['manaN']),initialMana=number(b['mana0']),baseArmor=number(b['def']),strength=number(b['STR']),agility=number(b['AGI']),intelligence=number(b['INT']),strengthGrowth=number(b['STRplus']),agilityGrowth=number(b['AGIplus']),intelligenceGrowth=number(b['INTplus']),primary=b['Primary'],armor=b['defType'],gold=int(number(b['goldcost'])),wood=int(number(b['lumbercost'])),food=number(b['fused']),time=number(b['bldtm']),speed=number(b['spd'])/100,collision=number(b['collision'])/100,healthRegen=number(b['regenHP']),regenerationType=b['regenType'],manaRegen=number(b['regenMana']),modelScale=number(ui['modelScale']),selectionScale=number(ui['scale']),sourceRows={n:tables[n][key] for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI']},sourceFunc=f,sourceStrings=safe_section(text['UnitStrings'],key),weapon=weapon,**icons(key,f['Art']))
  units[key].update(daySight=number(b['sight'])/100,nightSight=number(b['nsight'])/100)
  assert f and units[key]['sourceStrings'].get('Name'), 'Missing source unit section: '+key
 abilities={}
 for key in ['AHfs','AHbn','AHdr','AHpx','Asph','Aphx','Apxf','ACmi','ACrk']:
  row=tables['AbilityData'][key];f=safe_section(texts['AbilityFunc'],key) or safe_section(neutral_func,key) or safe_section(common_buff,key);levels=[]
  for n in range(1,int(row['levels'])+1):
   get=lambda field:number(row.get(field+str(n),'0'))
   level=dict(cost=get('Cost'),cooldown=get('Cool'),range=get('Rng')/100,radius=get('Area')/100,castTime=get('Cast'),duration=get('Dur'),heroDuration=get('HeroDur'))
   if key=='AHfs':level.update(fullTickDamage=get('DataA'),fullTickInterval=get('DataB'),residualTickDamage=get('DataC'),residualTickInterval=get('DataD'),buildingField=get('DataE'),maxDamageField=get('DataF'))
   elif key=='AHbn':level.update(moveReduction=get('DataA'),attackReduction=get('DataB'))
   elif key=='AHdr':level.update(lifeDrain=get('DataA'),manaDrain=get('DataB'),interval=get('DataC'),lifeTransfer=get('DataD'),manaTransfer=get('DataE'),lifeBonusFactor=get('DataF'),lifeBonusDecay=get('DataG'),manaBonusFactor=get('DataH'),manaBonusDecay=get('DataI'))
   elif key=='AHpx':level.update(count=get('DataA'),unit=row['UnitID'+str(n)])
   elif key=='Aphx':level.update(normalUnit=row['DataA'+str(n)],alternateUnit=row['UnitID'+str(n)],flags=get('DataB'),heightTransition=get('DataC'),landingDelay=get('DataD'))
   elif key=='Apxf':level.update(initialDamage=get('DataA'),damagePerSecond=get('DataB'))
   levels.append(level)
  abilities[key]=dict(sourceRow=row,sourceFunc=f,sourceStrings=safe_section(texts['AbilityStrings'],key) or safe_section(neutral_strings,key) or safe_section(common_strings,key),levels=levels)
  if f.get('Art'):abilities[key].update(icons(key,f['Art']))
  if f.get('Researchart'):abilities[key]['researchIcon']=icons(key+'-research',f['Researchart'])['icon']
 skill_builds={};skill={};slots={'FLAME_STRIKE':0,'BANISH':1,'SIPHON_MANA':2,'SUMMON_PHOENIX':3}
 for line in human.decode('utf8').splitlines():
  match=re.match(r'\s*set skill\[\s*(\d+)\]\s*=\s*(\w+)',line)
  if match:skill[int(match[1])]=match[2]
  match=re.match(r'\s*call SetSkillArray\(([123]),BLOOD_MAGE\)',line)
  if match:skill_builds[{'1':'first','2':'later','3':'third'}[match[1]]]=[slots[skill[n]] for n in range(1,11)]
 assert set(skill_builds)=={'first','later','third'}
 lightning={k:v for k,v in base.rows(original('Splats/LightningData.slk')).items() if k in ['DRAB','DRAL','DRAM']}
 for key,row in lightning.items():
  path=row['Dir']+'\\'+row['file'];raw=original(path);target='Assets/BloodMage/Lightning/'+row['file'].replace('.blp','.png');files[target]=decode_texture(raw);row['texture']=target
 classification={key:dict(race=row.get('race',''),type=row.get('type',''),deathType=int(number(row.get('deathType','0')))) for key,row in tables['UnitData'].items() if key in tables['UnitBalance']}
 buff_keys=set(['BHfs','BHbn','XHfs','Bphx'])|set(tables['AbilityData']['AHdr']['BuffID1'].split(','))
 buffs={k:dict(sourceRow=tables['AbilityBuffData'].get(k),sourceFunc=safe_section(texts['AbilityFunc'],k) or safe_section(common_buff,k)) for k in sorted(buff_keys)}
 for key,buff in buffs.items():
  assert buff['sourceRow'] or buff['sourceFunc'], 'Missing source buff definition: '+key
  if buff['sourceFunc'].get('Buffart'):buff.update(icons(key,buff['sourceFunc']['Buffart']))
 field_ids=['Hfs'+str(n) for n in range(1,7)]+['Hbn1','Hbn2']+['Ndr'+str(n) for n in range(1,10)]+['Hwe1','Hwe2']
 metadata={k:tables['AbilityMetaData'][k] for k in field_ids}
 files['blood-mage-rules.json']=encode(dict(author='MiYu',schemaVersion=1,units=units,abilities=abilities,classifications=classification,skillBuilds=skill_builds,misc=base.section(misc,'Misc'),fieldMetadata=metadata,lightning=lightning,originalRuntimeVerified=False,buffs=buffs,unverified=['Flame Strike main/residual tick boundaries and building/max-damage fields','Siphon Mana link distance, overflow cap and decay timing','Banish ethereal targeting and damage exceptions','Phoenix automatic targeting, egg/rebirth flags, replacement rules and fire stacking','Original attribute, attack-speed and experience parity']))
 preserve_outputs(files,output,old)
 print('PASS BloodMage preflight: source rules, unit strings, icons and lightning; seconds',round(time.perf_counter()-started,3),flush=True)
 with tempfile.TemporaryDirectory(prefix='frost-blood-mage-') as temp:
  work=pathlib.Path(temp);geometry=work/'geometry';geometry.mkdir();(geometry/'model-catalog.json').write_bytes(encode({}))
  bindings=work/'bindings.json';bindings.write_bytes(encode(dict(models=[r for r in BINDINGS if not r['key'].endswith('Portrait')])));overlay=work/'overlay'
  run('convert-frost-classic-billboards.py','--bindings',bindings,'--output',overlay,'--metadata-reader',args.metadata_reader)
  (geometry/'classic-sources.json').write_bytes(encode(dict(files=[])))
  for binding in BINDINGS:
   if not binding['key'].endswith('Portrait'):import_portrait(geometry,overlay,args.pose_probe,binding)
  portrait_bindings=work/'portrait-bindings.json';portrait_bindings.write_bytes(encode(dict(models=[r for r in BINDINGS if r['key'].endswith('Portrait')])))
  portrait_overlay=work/'portrait-overlay';run('convert-frost-classic-billboards.py','--bindings',portrait_bindings,'--output',portrait_overlay,'--metadata-reader',args.metadata_reader)
  for binding in BINDINGS:
   if binding['key'].endswith('Portrait'):import_portrait(geometry,portrait_overlay,args.pose_probe,binding)
  files['SourceAssets/BloodMage/portrait-node-conversion.json']=(portrait_overlay/'asset-sources.json').read_bytes()
  receipt=json.loads((geometry/'classic-sources.json').read_bytes())
  for record in receipt['files']:
   raw=(geometry/record['path']).read_bytes();assert sha(raw)==record['sha256'] and len(raw)==record['bytes']
   target=record['path'].replace('Assets/WarcraftIII/','Assets/BloodMage/')
   if target.endswith('.mmat'):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/BloodMage/')
   files[target]=raw
  files['blood-mage-models.json']=(geometry/'model-catalog.json').read_bytes().replace(b'Assets/WarcraftIII/',b'Assets/BloodMage/')
  files['SourceAssets/BloodMage/node-conversion.json']=(overlay/'asset-sources.json').read_bytes();views={}
  for binding in BINDINGS:
   library=ROOT/'asset-library/warcraft-iii'/binding['pack'];signed=json.loads((library/'asset-sources.json').read_bytes())
   record=next(r for r in signed['sourceFiles'] if r['path'].replace('\\','/').lower()==binding['model'].lower());path=record['path'].replace('\\','/');raw=(library/'SourceAssets'/path).read_bytes()
   assert sha(raw)==record['sha256'] and len(raw)==record['bytes'];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(record,path=path,pack=binding['pack']))
   if binding['key'].endswith('Portrait'):views[binding['key']]=dict(source=path,sourceSha256=sha(raw),**portrait(raw))
  files['blood-mage-portraits.json']=encode(views)
  effects=work/'effects';run('convert-warcraft-effects.py','--output',effects,'--sampler',args.sampler,*[v for _,path in SPELLS for v in ['--source','remaining-ready/'+path]])
  effect_receipt=json.loads((effects/'asset-sources.json').read_bytes())
  for record in effect_receipt['generatedFiles']:
   if not record['path'].startswith('Assets/') or record['path'].endswith('effect-catalog.json'):continue
   raw=(effects/record['path']).read_bytes();assert sha(raw)==record['sha256'];target=record['path'].replace('Assets/WarcraftIII/','Assets/BloodMage/')
   if target.endswith(('.meffect','.mfx','.json')):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/BloodMage/')
   files[target]=raw
  meshes=json.loads(files['blood-mage-models.json']);art={}
  for effect in json.loads((effects/'Assets/WarcraftIII/effect-catalog.json').read_bytes())['models']:
   source_name=pathlib.PureWindowsPath(effect['source']).stem;name=next(n for n,_ in SPELLS if n.lower()==source_name.lower())
   mesh=meshes.get('ClassicBloodMage'+name) or dict(parts=[],animations=[dict(name=c['name'],frames=c['frames'],duration=c['duration'],loop=c['loop']) for c in effect['clips']])
   assert [c['name'] for c in effect['clips']]==[c['name'] for c in mesh['animations']]
   art[name]=dict(effect=effect['effect'].replace('Assets/WarcraftIII/','Assets/BloodMage/'),parts=mesh['parts'],animations=mesh['animations'])
  for binding in [ACTORS[0],ACTORS[2]]:art[binding['key']+'Embedded']=actor_effect(binding,args.sampler,work,files)
  files['blood-mage-art.json']=encode(art);files['SourceAssets/BloodMage/effect-conversion.json']=encode(effect_receipt)
  for r in effect_receipt['sourceFiles']:
   raw=(effects/'SourceAssets'/r['path']).read_bytes();assert sha(raw)==r['sha256'] and len(raw)==r['bytes'];path=r['path'].split('/',1)[1];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,pack=r['path'].split('/',1)[0],sha256=r['sha256'],bytes=r['bytes']))
 files['Assets/BloodMage/.gitattributes']=b'* -text whitespace=cr-at-eol\n'
 files['SourceAssets/BloodMage/.gitattributes']=b'* -text whitespace=cr-at-eol\n'
 files['Assets/Licenses/Classic-BloodMage.txt']=b'Original Warcraft III assets and rules belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source hashes and generators: blood-mage-sources.json.\n'
 tools=['scripts/import-frost-blood-mage.py','scripts/import-frost-paladin.py','scripts/import-frost-demon-hunter.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-dryad-portrait.py','scripts/convert-warcraft-effects.py','scripts/convert-warcraft-assets.py','scripts/import-frost-druids.py','scripts/import-frost-entangled-assets.py','scripts/import-frost-wisp-rules.py','scripts/import-frost-natures-blessing.py','scripts/warcraft_mpq.py']
 receipt=dict(author='MiYu',generatorHashMode='lf-text',generators={p:sha((ROOT/p).read_bytes().replace(b'\r\n',b'\n')) for p in tools},poseProbeSha256=sha(args.pose_probe.read_bytes()),sources=sources,files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())])
 preserve_outputs(files,output,old)
 for p,raw in files.items():
  target=output/p;target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists() or target.read_bytes()!=raw:target.write_bytes(raw)
 receipt_path.write_bytes(encode(receipt));print('PASS original BloodMage source import:',len(files),'signed outputs; seconds',round(time.perf_counter()-started,3))

if __name__=='__main__':main()

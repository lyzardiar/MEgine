"""Author: MiYu. Reproduce signed original Mountain King geometry, portraits, icons and rules."""
import argparse
import importlib
import json
import pathlib
import re
import subprocess
import sys
import tempfile

base=importlib.import_module('import-frost-druids')
portrait=importlib.import_module('import-frost-demon-hunter').portrait
ROOT,SAMPLE,sha,encode=base.ROOT,base.SAMPLE,base.sha,base.encode
BINDINGS=[dict(key='ClassicMountainKing',source='HeroMountainKing',pack='game-ready',model='Units/Human/HeroMountainKing/HeroMountainKing.mdx'),dict(key='ClassicMountainKingPortrait',source='HeroMountainKing_Portrait',pack='remaining-ready',model='Units/Human/HeroMountainKing/HeroMountainKing_Portrait.mdx',environment=True)]
SPELLS=[('StormBoltMissile','Human/StormBolt'),('ThunderClapCaster','Human/Thunderclap'),('AvatarCaster','Human/Avatar'),('ThunderclapTarget','Human/Thunderclap'),('StasisTotemTarget','Orc/StasisTrap')]
BINDINGS += [dict(key='ClassicMountainKing'+n,source=n,pack='remaining-ready',model=f'Abilities/Spells/{d}/{n}.mdx',environment=True) for n,d in SPELLS]

import_portrait=importlib.import_module('import-frost-paladin').import_portrait

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
  else:raise ValueError('Missing original MountainKing source: '+path)
  path=path.replace('\\','/');files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,archive=name,bytes=len(raw),sha256=sha(raw)));return raw
 with tempfile.TemporaryDirectory(prefix='frost-mountain-king-') as temp:
  work=pathlib.Path(temp);geometry=work/'geometry';geometry.mkdir();(geometry/'model-catalog.json').write_bytes(encode({}))
  bindings=work/'bindings.json';bindings.write_bytes(encode(dict(models=[r for r in BINDINGS if r['key']!='ClassicMountainKingPortrait'])));overlay=work/'overlay'
  run('convert-frost-classic-billboards.py','--bindings',bindings,'--output',overlay,'--metadata-reader',args.metadata_reader)
  (geometry/'classic-sources.json').write_bytes(encode(dict(files=[])))
  for binding in BINDINGS:
   if binding['key']!='ClassicMountainKingPortrait':import_portrait(geometry,overlay,args.pose_probe,binding)
  portrait_bindings=work/'portrait-bindings.json';portrait_bindings.write_bytes(encode(dict(models=[r for r in BINDINGS if r['key']=='ClassicMountainKingPortrait'])))
  portrait_overlay=work/'portrait-overlay';run('convert-frost-classic-billboards.py','--bindings',portrait_bindings,'--output',portrait_overlay,'--metadata-reader',args.metadata_reader)
  import_portrait(geometry,portrait_overlay,args.pose_probe,BINDINGS[1])
  files['SourceAssets/MountainKing/portrait-node-conversion.json']=(portrait_overlay/'asset-sources.json').read_bytes()
  receipt=json.loads((geometry/'classic-sources.json').read_bytes())
  for record in receipt['files']:
   raw=(geometry/record['path']).read_bytes();assert sha(raw)==record['sha256'] and len(raw)==record['bytes']
   target=record['path'].replace('Assets/WarcraftIII/','Assets/MountainKing/')
   if target.endswith('.mmat'):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/MountainKing/')
   files[target]=raw
  files['mountain-king-models.json']=(geometry/'model-catalog.json').read_bytes().replace(b'Assets/WarcraftIII/',b'Assets/MountainKing/')
  files['SourceAssets/MountainKing/node-conversion.json']=(overlay/'asset-sources.json').read_bytes();views={}
  for binding in BINDINGS:
   library=ROOT/'asset-library/warcraft-iii'/binding['pack'];signed=json.loads((library/'asset-sources.json').read_bytes())
   record=next(r for r in signed['sourceFiles'] if r['path'].replace('\\','/').lower()==binding['model'].lower());path=record['path'].replace('\\','/');raw=(library/'SourceAssets'/path).read_bytes()
   assert sha(raw)==record['sha256'] and len(raw)==record['bytes'];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(record,path=path,pack=binding['pack']))
   if binding['key'].endswith('Portrait'):views[binding['key']]=dict(source=path,sourceSha256=sha(raw),**portrait(raw))
  files['mountain-king-portraits.json']=encode(views)
  effects=work/'effects';run('convert-warcraft-effects.py','--output',effects,'--sampler',args.sampler,*[v for path in [f'Abilities/Spells/{d}/{n}.mdx' for n,d in SPELLS] for v in ['--source','remaining-ready/'+path]])
  effect_receipt=json.loads((effects/'asset-sources.json').read_bytes())
  for record in effect_receipt['generatedFiles']:
   if not record['path'].startswith('Assets/') or record['path'].endswith('effect-catalog.json'):continue
   raw=(effects/record['path']).read_bytes();assert sha(raw)==record['sha256'];target=record['path'].replace('Assets/WarcraftIII/','Assets/MountainKing/')
   if target.endswith(('.meffect','.mfx','.json')):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/MountainKing/')
   files[target]=raw
  meshes=json.loads(files['mountain-king-models.json']);art={}
  for effect in json.loads((effects/'Assets/WarcraftIII/effect-catalog.json').read_bytes())['models']:
   source_name=pathlib.PureWindowsPath(effect['source']).stem;name=next(n for n,_ in SPELLS if n.lower()==source_name.lower())
   mesh=meshes.get('ClassicMountainKing'+name) or dict(parts=[],animations=[dict(name=c['name'],frames=c['frames'],duration=c['duration'],loop=c['loop']) for c in effect['clips']])
   assert [c['name'] for c in effect['clips']]==[c['name'] for c in mesh['animations']]
   art[name]=dict(effect=effect['effect'].replace('Assets/WarcraftIII/','Assets/MountainKing/'),parts=mesh['parts'],animations=mesh['animations'])
  files['mountain-king-art.json']=encode(art);files['SourceAssets/MountainKing/effect-conversion.json']=encode(effect_receipt)
  for r in effect_receipt['sourceFiles']:
   raw=(effects/'SourceAssets'/r['path']).read_bytes();assert sha(raw)==r['sha256'] and len(raw)==r['bytes'];path=r['path'].split('/',1)[1];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,pack=r['path'].split('/',1)[0],sha256=r['sha256'],bytes=r['bytes']))
 tables={n:base.rows(original('Units/'+n+'.slk')) for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI','AbilityData','AbilityMetaData','AbilityBuffData']}
 texts={n:original('Units/Human'+n+'.txt') for n in ['UnitFunc','UnitStrings','AbilityFunc','AbilityStrings']}
 common_buff=original('Units/CommonAbilityFunc.txt');human=original('Scripts/human.ai');original('Scripts/common.ai');misc=original('Units/MiscGame.txt');original('UI/WorldEditStrings.txt');original('UI/UnitEditorData.txt')
 def icons(key,path):
  result={}
  for field,source in [('icon',path),('disabledIcon',path.replace('\\CommandButtons\\BTN','\\CommandButtonsDisabled\\DISBTN').replace('\\PassiveButtons\\PASBTN','\\CommandButtonsDisabled\\DISPASBTN'))]:
   raw=original(source);target='Assets/Art/classic-mountain-king-'+key+('-disabled' if field=='disabledIcon' else '')+'.png';files[target]=base.base.decode_icon(raw);result[field]=target
  return result
 number=lambda value:float(value) if value.strip() not in ['-','_',''] else 0
 units={}
 for key in ['Hmkg']:
  b,w,ui=[tables[n][key] for n in ['UnitBalance','UnitWeapons','unitUI']];text=texts;f=base.section(text['UnitFunc'],key)
  weapon=dict(damage=number(w['avgdmg1']),dice=int(number(w['dice1'])),sides=int(number(w['sides1'])),bonus=number(w['dmgplus1']),attack=w['atkType1'],range=number(w['rangeN1'])/100,cooldown=number(w['cool1']),damagePoint=number(w['dmgpt1']),backswing=number(w['backSw1']),missileSpeed=number(f.get('Missilespeed','0'))/100,antiAir='air' in w['targs1'].split(','),enabled=number(w['weapsOn'])>0)
  units[key]=dict(sourceUnit=key,label='Mountain King',model='ClassicMountainKing',portrait='ClassicMountainKingPortrait',baseHp=number(b['HP']),baseMana=number(b['manaN']),initialMana=number(b['mana0']),baseArmor=number(b['def']),strength=number(b['STR']),agility=number(b['AGI']),intelligence=number(b['INT']),strengthGrowth=number(b['STRplus']),agilityGrowth=number(b['AGIplus']),intelligenceGrowth=number(b['INTplus']),primary=b['Primary'],armor=b['defType'],gold=int(number(b['goldcost'])),wood=int(number(b['lumbercost'])),food=number(b['fused']),time=number(b['bldtm']),speed=number(b['spd'])/100,collision=number(b['collision'])/100,healthRegen=number(b['regenHP']),regenerationType=b['regenType'],manaRegen=number(b['regenMana']),modelScale=number(ui['modelScale']),selectionScale=number(ui['scale']),sourceRows={n:tables[n][key] for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI']},sourceFunc=f,sourceStrings=base.section(text['UnitStrings'],key),weapon=weapon,**icons(key,f['Art']))
  units[key].update(daySight=number(b['sight'])/100,nightSight=number(b['nsight'])/100)
 abilities={}
 for key in ['AHtb','AHtc','AHbh','AHav']:
  row=tables['AbilityData'][key];f=base.section(texts['AbilityFunc'],key);levels=[]
  for n in range(1,int(row['levels'])+1):
   get=lambda field:number(row[field+str(n)])
   level=dict(cost=get('Cost'),cooldown=get('Cool'),range=get('Rng')/100,radius=get('Area')/100,castTime=get('Cast'),duration=get('Dur'),heroDuration=get('HeroDur'))
   if key=='AHtb':level.update(damage=get('DataA'))
   elif key=='AHtc':level.update(damage=get('DataA'),specificDamage=get('DataB'),moveReduction=get('DataC'),attackReduction=get('DataD'))
   elif key=='AHbh':level.update(chance=get('DataA')/100,damageMultiplier=get('DataB'),bonusDamage=get('DataC'),missChance=get('DataD'))
   else:level.update(armorBonus=get('DataA'),healthBonus=get('DataB'),damageBonus=get('DataC'),magicDamageReduction=get('DataD'),scaleField=get('Area'),magicImmune=True,canDeactivate=bool(number(base.section(misc,'Misc')['CanDeactivateAvatar'])))
   levels.append(level)
  abilities[key]=dict(sourceRow=row,sourceFunc=f,sourceStrings=base.section(texts['AbilityStrings'],key),levels=levels,**icons(key,f['Art']))
  if f.get('Researchart'):abilities[key]['researchIcon']=icons(key+'-research',f['Researchart'])['icon']
 skill_builds={};skill={};slots={'THUNDER_BOLT':0,'THUNDER_CLAP':1,'BASH':2,'AVATAR':3}
 for line in human.decode('utf8').splitlines():
  match=re.match(r'\s*set skill\[\s*(\d+)\]\s*=\s*(\w+)',line)
  if match:skill[int(match[1])]=match[2]
  match=re.match(r'\s*call SetSkillArray\(([123]),MTN_KING\)',line)
  if match:skill_builds[{'1':'first','2':'later','3':'third'}[match[1]]]=[slots[skill[n]] for n in range(1,11)]
 assert set(skill_builds)=={'first','later','third'}
 classification={key:dict(race=row.get('race',''),type=row.get('type',''),deathType=int(number(row.get('deathType','0')))) for key,row in tables['UnitData'].items() if key in tables['UnitBalance']}
 files['mountain-king-rules.json']=encode(dict(author='MiYu',schemaVersion=1,units=units,abilities=abilities,classifications=classification,skillBuilds=skill_builds,misc=base.section(misc,'Misc'),originalRuntimeVerified=False,buffs={k:dict(sourceRow=tables['AbilityBuffData'][k],sourceFunc=base.section(common_buff if k=='BPSE' else texts['AbilityFunc'],k)) for k in ['BPSE','BHtc']},unverified=['Bash bonus damage type, armor and magic-immunity semantics','Thunder Clap target-mask behavior','Avatar health adjustment, immunity exceptions and scale-field execution','Original attribute rounding, attack speed and experience parity']))
 files['Assets/MountainKing/.gitattributes']=b'* -text whitespace=cr-at-eol\n'
 files['SourceAssets/MountainKing/.gitattributes']=b'* -text whitespace=cr-at-eol\n'
 files['Assets/Licenses/Classic-MountainKing.txt']=b'Original Warcraft III assets and rules belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source hashes and generators: mountain-king-sources.json.\n'
 tools=['scripts/import-frost-mountain-king.py','scripts/import-frost-paladin.py','scripts/import-frost-demon-hunter.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-dryad-portrait.py','scripts/convert-warcraft-effects.py','scripts/import-frost-druids.py','scripts/import-frost-entangled-assets.py','scripts/import-frost-wisp-rules.py','scripts/import-frost-natures-blessing.py','scripts/warcraft_mpq.py']
 receipt=dict(author='MiYu',generatorHashMode='lf-text',generators={p:sha((ROOT/p).read_bytes().replace(b'\r\n',b'\n')) for p in tools},poseProbeSha256=sha(args.pose_probe.read_bytes()),sources=sources,files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())]);output=args.output.resolve();receipt_path=output/'mountain-king-sources.json';previous=json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {};old={r['path']:r['sha256'] for r in previous.get('files',[])}
 for p,raw in files.items():
  target=output/p;assert not target.exists() or target.read_bytes()==raw or sha(target.read_bytes())==old.get(p),'Preserve modified MountainKing output: '+p
 for p,raw in files.items():
  target=output/p;target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists() or target.read_bytes()!=raw:target.write_bytes(raw)
 receipt_path.write_bytes(encode(receipt));print('PASS original MountainKing source import:',len(files),'signed outputs')

if __name__=='__main__':main()

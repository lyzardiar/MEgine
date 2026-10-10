"""Author: MiYu. Reproduce signed original Priestess of the Moon geometry, portraits, icons and rules."""
import argparse
import importlib
material_meta = importlib.import_module('import-frost-classic').remap_material_meta
import json
import pathlib
import re
import subprocess
import struct
import sys
import tempfile

base=importlib.import_module('import-frost-druids')
portrait=importlib.import_module('import-frost-demon-hunter').portrait
ROOT,SAMPLE,sha,encode=base.ROOT,base.SAMPLE,base.sha,base.encode
BINDINGS=[dict(key='ClassicPriestess',source='HeroMoonPriestess',pack='game-ready',model='Units/NightElf/HeroMoonPriestess/HeroMoonPriestess.mdx'),dict(key='ClassicPriestessPortrait',source='HeroMoonPriestess_Portrait',pack='remaining-ready',model='Units/NightElf/HeroMoonPriestess/HeroMoonPriestess_Portrait.mdx',environment=True),dict(key='ClassicOwlScout',source='OwlScout',pack='remaining-ready',model='Units/NightElf/OwlScout/OwlScout.mdx'),dict(key='ClassicPriestessScoutMissile',source='Owl',pack='remaining-ready',model='Units/NightElf/Owl/Owl.mdx',environment=True)]
SPELLS=[('TrueshotAura','NightElf/TrueshotAura'),('StarfallCaster','NightElf/Starfall'),('StarfallTarget','NightElf/Starfall')]
BINDINGS += [dict(key='ClassicPriestess'+n,source=n,pack='remaining-ready',model=f'Abilities/Spells/{d}/{n}.mdx',environment=True) for n,d in SPELLS]+[dict(key='ClassicPriestessMissile',source='MoonPriestessMissile',pack='remaining-ready',model='Abilities/Weapons/MoonPriestessMissile/MoonPriestessMissile.mdx',environment=True),dict(key='ClassicPriestessSearingMissile',source='SearingArrowMissile',pack='remaining-ready',model='Abilities/Weapons/SearingArrow/SearingArrowMissile.mdx',environment=True)]

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
  else:raise ValueError('Missing original Priestess of the Moon source: '+path)
  path=path.replace('\\','/');files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,archive=name,bytes=len(raw),sha256=sha(raw)));return raw
 with tempfile.TemporaryDirectory(prefix='frost-priestess-') as temp:
  work=pathlib.Path(temp);geometry=work/'geometry';geometry.mkdir();(geometry/'model-catalog.json').write_bytes(encode({}))
  bindings=work/'bindings.json';bindings.write_bytes(encode(dict(models=BINDINGS)));overlay=work/'overlay'
  run('convert-frost-classic-billboards.py','--bindings',bindings,'--output',overlay,'--metadata-reader',args.metadata_reader)
  run('import-frost-classic.py','--bindings',bindings,'--output',geometry,'--keys',*[r['key'] for r in BINDINGS],'--billboard-library',overlay,'--pose-probe',args.pose_probe)
  receipt=json.loads((geometry/'classic-sources.json').read_bytes())
  for record in receipt['files']:
   raw=(geometry/record['path']).read_bytes();assert sha(raw)==record['sha256'] and len(raw)==record['bytes']
   target=record['path'].replace('Assets/WarcraftIII/','Assets/Priestess/')
   if target.endswith('.mmat'):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/Priestess/')
   files[target]=material_meta(target, raw)
  files['priestess-models.json']=(geometry/'model-catalog.json').read_bytes().replace(b'Assets/WarcraftIII/',b'Assets/Priestess/')
  files['SourceAssets/Priestess/node-conversion.json']=(overlay/'asset-sources.json').read_bytes();views={}
  for binding in BINDINGS:
   library=ROOT/'asset-library/warcraft-iii'/binding['pack'];signed=json.loads((library/'asset-sources.json').read_bytes())
   record=next(r for r in signed['sourceFiles'] if r['path'].replace('\\','/').lower()==binding['model'].lower());path=record['path'].replace('\\','/');raw=(library/'SourceAssets'/path).read_bytes()
   assert sha(raw)==record['sha256'] and len(raw)==record['bytes'];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(record,path=path,pack=binding['pack']))
   if binding['key'].endswith('Portrait') or binding['key']=='ClassicOwlScout':views[binding['key']]=dict(source=path,sourceSha256=sha(raw),**portrait(raw))
  files['priestess-portraits.json']=encode(views)
  effects=work/'effects';run('convert-warcraft-effects.py','--output',effects,'--sampler',args.sampler,*[v for n,d in SPELLS for v in ['--source',f'remaining-ready/Abilities/Spells/{d}/{n}.mdx']])
  effect_receipt=json.loads((effects/'asset-sources.json').read_bytes())
  for record in effect_receipt['generatedFiles']:
   if not record['path'].startswith('Assets/') or record['path'].endswith('effect-catalog.json'):continue
   raw=(effects/record['path']).read_bytes();assert sha(raw)==record['sha256'];target=record['path'].replace('Assets/WarcraftIII/','Assets/Priestess/')
   if target.endswith(('.meffect','.json')):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/Priestess/')
   files[target]=material_meta(target, raw)
  meshes=json.loads(files['priestess-models.json']);art={}
  for effect in json.loads((effects/'Assets/WarcraftIII/effect-catalog.json').read_bytes())['models']:
   name=pathlib.PureWindowsPath(effect['source']).stem
   mesh=meshes.get('ClassicPriestess'+name) or dict(parts=[],animations=[dict(name=c['name'],frames=c['frames'],duration=c['duration'],loop=c['loop']) for c in effect['clips']])
   assert [c['name'] for c in effect['clips']]==[c['name'] for c in mesh['animations']]
   art[name]=dict(effect=effect['effect'].replace('Assets/WarcraftIII/','Assets/Priestess/'),parts=mesh['parts'],animations=mesh['animations'])
  files['priestess-art.json']=encode(art);files['SourceAssets/Priestess/effect-conversion.json']=encode(effect_receipt)
  for r in effect_receipt['sourceFiles']:
   raw=(effects/'SourceAssets'/r['path']).read_bytes();assert sha(raw)==r['sha256'] and len(raw)==r['bytes'];path=r['path'].split('/',1)[1];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,pack=r['path'].split('/',1)[0],sha256=r['sha256'],bytes=r['bytes']))
 tables={n:base.rows(original('Units/'+n+'.slk')) for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI','AbilityData','AbilityMetaData']}
 texts={n:original('Units/NightElf'+n+'.txt') for n in ['UnitFunc','UnitStrings','AbilityFunc','AbilityStrings']}
 neutral={n:original('Units/Neutral'+n+'.txt') for n in ['UnitFunc','UnitStrings']}
 elf=original('Scripts/elf.ai');original('Scripts/common.ai');misc=original('Units/MiscGame.txt');original('UI/WorldEditStrings.txt');original('UI/UnitEditorData.txt')
 def icons(key,path):
  result={}
  for field,source in [('icon',path),('disabledIcon',path.replace('\\CommandButtons\\BTN','\\CommandButtonsDisabled\\DISBTN').replace('\\PassiveButtons\\PASBTN','\\CommandButtonsDisabled\\DISPASBTN'))]:
   raw=original(source);target='Assets/Art/classic-priestess-'+key+('-disabled' if field=='disabledIcon' else '')+'.png';files[target]=base.base.decode_icon(raw);result[field]=target
  return result
 number=lambda value:float(value) if value.strip() not in ['-','_',''] else 0
 units={}
 for key in ['Emoo','nowl','now2','now3']:
  b,w,ui=[tables[n][key] for n in ['UnitBalance','UnitWeapons','unitUI']];text=texts if key=='Emoo' else neutral;f=base.section(text['UnitFunc'],key)
  weapon=dict(damage=number(w['avgdmg1']),dice=int(number(w['dice1'])),sides=int(number(w['sides1'])),bonus=number(w['dmgplus1']),attack=w['atkType1'],range=number(w['rangeN1'])/100,cooldown=number(w['cool1']),damagePoint=number(w['dmgpt1']),backswing=number(w['backSw1']),missileSpeed=number(f.get('Missilespeed','0'))/100,antiAir='air' in w['targs1'].split(','),enabled=number(w['weapsOn'])>0)
  units[key]=dict(sourceUnit=key,label='Priestess of the Moon' if key=='Emoo' else 'Owl Scout',model='ClassicPriestess' if key=='Emoo' else 'ClassicOwlScout',portrait='ClassicPriestessPortrait' if key=='Emoo' else 'ClassicOwlScout',baseHp=number(b['HP']),baseMana=number(b['manaN']),initialMana=number(b['mana0']),baseArmor=number(b['def']),strength=number(b['STR']),agility=number(b['AGI']),intelligence=number(b['INT']),strengthGrowth=number(b['STRplus']),agilityGrowth=number(b['AGIplus']),intelligenceGrowth=number(b['INTplus']),primary=b['Primary'],armor=b['defType'],gold=int(number(b['goldcost'])),wood=int(number(b['lumbercost'])),food=number(b['fused']),time=number(b['bldtm']),speed=number(b['spd'])/100,collision=number(b['collision'])/100,nightRegen=number(b['regenHP']),manaRegen=number(b['regenMana']),modelScale=number(ui['modelScale']),selectionScale=number(ui['scale']),sourceRows={n:tables[n][key] for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI']},sourceFunc=f,sourceStrings=base.section(text['UnitStrings'],key),weapon=weapon,**icons(key,f['Art']))
  if key!='Emoo':units[key].update(flying=True,invulnerable=True,magicImmune=True,flightHeight=number(tables['UnitData'][key]['moveHeight'])/100,daySight=number(b['sight'])/100,nightSight=number(b['nsight'])/100)
 abilities={}
 for key in ['AEst','AHfa','AEar','AEsf']:
  row=tables['AbilityData'][key];f=base.section(texts['AbilityFunc'],key)
  abilities[key]=dict(sourceRow=row,sourceFunc=f,sourceStrings=base.section(texts['AbilityStrings'],key),levels=[dict(cost=number(row['Cost'+str(n)]),cooldown=number(row['Cool'+str(n)]),range=number(row['Rng'+str(n)])/100,radius=number(row['Area'+str(n)])/100,power=number(row['DataA'+str(n)]),duration=number(row['Dur'+str(n)]),heroDuration=number(row['HeroDur'+str(n)]),interval=number(row['DataB'+str(n)]),buildingField=number(row['DataC'+str(n)]),**({'unit':row['UnitID'+str(n)]} if key=='AEst' else {})) for n in range(1,int(row['levels'])+1)],**icons(key,f['Art']))
  if f.get('Researchart'):abilities[key]['researchIcon']=icons(key+'-research',f['Researchart'])['icon']
  if key=='AHfa':abilities[key]['offIcon']=icons('searing-off',f['Unart'])['icon']
 abilities['Adtg']=dict(sourceRow=tables['AbilityData']['Adtg'])
 skill_builds={};skill={};slots={'SCOUT':0,'SEARING_ARROWS':1,'TRUESHOT':2,'STARFALL':3}
 for line in elf.decode('utf8').splitlines():
  match=re.match(r'\s*set skill\[\s*(\d+)\]\s*=\s*(\w+)',line)
  if match:skill[int(match[1])]=match[2]
  match=re.match(r'\s*call SetSkillArray\(([123]),MOON_(?:CHICK|BABE|HONEY)\)',line)
  if match:skill_builds[{'1':'first','2':'later','3':'third'}[match[1]]]=[slots[skill[n]] for n in range(1,11)]
 assert set(skill_builds)=={'first','later','third'}
 files['priestess-rules.json']=encode(dict(author='MiYu',schemaVersion=1,units=units,abilities=abilities,skillBuilds=skill_builds,misc=base.section(misc,'Misc'),originalRuntimeVerified=False,unverified=['Original attribute rounding and full attack-speed behavior','Scout repeated-summon replacement and spawn placement','Searing manual/autocast range, damage type and magic immunity interactions','Trueshot damage basis, stacking and aura linger','Starfall first pulse, actual waves, Dur45/HeroDur30 and building damage formula','Original experience award parity']))
 files['Assets/Priestess/.gitattributes']=b'* -text whitespace=cr-at-eol\n'
 files['SourceAssets/WarcraftIII/Units/.gitattributes']=b'NeutralUnitFunc.txt -text -diff\nNeutralUnitStrings.txt -text -diff\n'
 files['Assets/Licenses/Classic-Priestess.txt']=b'Original Warcraft III assets and rules belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source hashes and generators: priestess-sources.json.\n'
 tools=['scripts/import-frost-priestess.py','scripts/import-frost-demon-hunter.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-dryad-portrait.py','scripts/convert-warcraft-effects.py','scripts/import-frost-druids.py','scripts/import-frost-entangled-assets.py','scripts/import-frost-wisp-rules.py','scripts/import-frost-natures-blessing.py','scripts/warcraft_mpq.py']
 receipt=dict(author='MiYu',generatorHashMode='lf-text',generators={p:sha((ROOT/p).read_bytes().replace(b'\r\n',b'\n')) for p in tools},poseProbeSha256=sha(args.pose_probe.read_bytes()),sources=sources,files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())]);output=args.output.resolve();receipt_path=output/'priestess-sources.json';previous=json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {};old={r['path']:r['sha256'] for r in previous.get('files',[])}
 for p,raw in files.items():
  target=output/p;assert not target.exists() or target.read_bytes()==raw or sha(target.read_bytes())==old.get(p),'Preserve modified Priestess of the Moon output: '+p
 for p,raw in files.items():
  target=output/p;target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists() or target.read_bytes()!=raw:target.write_bytes(raw)
 receipt_path.write_bytes(encode(receipt));print('PASS original Priestess of the Moon source import:',len(files),'signed outputs')

if __name__=='__main__':main()

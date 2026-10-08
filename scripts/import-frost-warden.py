"""Author: MiYu. Reproduce signed original Warden geometry, portraits, icons and rules."""
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
portrait=importlib.import_module('import-frost-demon-hunter').portrait
ROOT,SAMPLE,sha,encode=base.ROOT,base.SAMPLE,base.sha,base.encode
BINDINGS=[dict(key='ClassicWarden',source='HeroWarden',pack='remaining-ready',model='Units/NightElf/HeroWarden/HeroWarden.mdx'),dict(key='ClassicWardenPortrait',source='HeroWarden_Portrait',pack='remaining-ready',model='Units/NightElf/HeroWarden/HeroWarden_Portrait.mdx',environment=True),dict(key='ClassicVengeanceAvatar',source='SpiritOfVengeance',pack='game-ready',model='Units/NightElf/SpiritOfVengeance/SpiritOfVengeance.mdx'),dict(key='ClassicVengeanceAvatarPortrait',source='SpiritOfVengeance_Portrait',pack='remaining-ready',model='Units/NightElf/SpiritOfVengeance/SpiritOfVengeance_Portrait.mdx',environment=True),dict(key='ClassicVengeanceSpirit',source='Vengeance',pack='game-ready',model='Units/NightElf/Vengeance/Vengeance.mdx'),dict(key='ClassicVengeanceSpiritPortrait',source='Vengeance_Portrait',pack='remaining-ready',model='Units/NightElf/Vengeance/Vengeance_Portrait.mdx',environment=True)]
SPELLS=[('BlinkCaster','NightElf/Blink'),('BlinkTarget','NightElf/Blink'),('FanOfKnivesCaster','NightElf/FanOfKnives'),('FanOfKnivesMissile','NightElf/FanOfKnives'),('shadowstrike','NightElf/shadowstrike'),('ShadowStrikeMissile','NightElf/shadowstrike'),('SpiritOfVengeanceBirthMissile','NightElf/SpiritOfVengeance'),('feralspiritdone','Orc/FeralSpirit')]+[(f'SpiritOfVengeanceOrbs{i}','NightElf/SpiritOfVengeance') for i in range(1,7)]
BINDINGS += [dict(key='ClassicWarden'+n,source=n,pack='remaining-ready',model=f'Abilities/Spells/{d}/{n}.mdx',environment=True) for n,d in SPELLS]+[dict(key='ClassicWarden'+n,source=n,pack='remaining-ready',model=f'Abilities/Weapons/{n}/{n}.mdx',environment=True) for n in ['SpiritOfVengeanceMissile','VengeanceMissile','WardenMissile']]

def model_geometry(bindings,overlay,output,pose_probe):
 """Retain every source layer and measure a visible source pose, including transparent Birth starts."""
 nodes=importlib.import_module('convert-frost-classic-billboards');overrides,_,_=nodes.load_overlay(overlay)
 catalogs={};receipts={};catalog={};files={};probe=subprocess.Popen([str(pose_probe),'--stdin'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8')
 def copy(pack,relative):
  library=ROOT/'asset-library/warcraft-iii'/pack
  if pack not in receipts:receipts[pack]={nodes.key(r['path']):r for r in json.loads((library/'asset-sources.json').read_bytes())['generatedFiles']}
  record=receipts[pack][nodes.key(relative)];path=record['path'];source=(library/path).read_bytes();assert sha(source)==record['sha256'] and len(source)==record['bytes'],path
  raw=overrides.get((pack,nodes.key(path)),source);target=output/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw);files[path]=dict(path=path,bytes=len(raw),sha256=sha(raw));return path
 try:
  for b in bindings:
   pack=b['pack'];library=ROOT/'asset-library/warcraft-iii'/pack
   if pack not in catalogs:catalogs[pack]={m['id'].lower():m for m in json.loads((library/'Assets/WarcraftIII/model-catalog.json').read_bytes())['models']}
   model=catalogs[pack][b['source'].lower()];assert nodes.key(model['source'])==nodes.key(b['model']);tracks=json.loads((library/model['stateTracks']).read_bytes());parts=[]
   for original in model['parts']:
    part=dict(original,mesh=original['animatedMesh'] if model['clips'] else original['mesh'],pivot=[0,0,0],states=[])
    for relative in {original['mesh'],original['animatedMesh']}:copy(pack,relative);copy(pack,relative+'.meta')
    for relative in {original['material'],*original['teamMaterials'].values(),*original['textureMaterials'].values()}:
     copy(pack,relative);material=json.loads((output/relative).read_bytes())
     for field in ['base_color_texture','normal_texture','metallic_roughness_texture','occlusion_texture','emissive_texture']:
      if material.get(field):copy(pack,material[field])
    for clip in tracks['clips']:
     runs=[];last=None
     for frame,state in enumerate(clip['frames']):
      geo=state['geosets'][part['geoset']];layer=state['materials'][part['materialIndex']][part['layer']];value=[*geo['color'],geo['alpha']*layer['alpha'],layer['texture']]
      if value!=last:runs.append([frame,*value]);last=value
     part['states'].append(runs)
    placement=json.loads((output/part['material']).read_bytes());placement.update(surface='transparent',transparent_depth_write=False,render_queue=4000+part['layer'])
    if placement['blend_mode'] not in ['additive','multiply']:placement['blend_mode']='alpha'
    relative='Assets/WarcraftIII/Materials/Placement/'+sha(part['material'].encode())[:20]+'.mmat';raw=encode(placement);target=output/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw);files[relative]=dict(path=relative,bytes=len(raw),sha256=sha(raw));part['placementMaterial']=relative;parts.append(part)
   assert parts,b['key'];preferred=next((i for i,c in enumerate(model['clips']) if c['name'].lower()=='stand'),0);poses=[(preferred,i) for i in range(len(tracks['clips'][preferred]['frames']))] if tracks['clips'] else [(-1,0)]
   poses += [(j,i) for j,c in enumerate(tracks['clips']) if j!=preferred for i in range(len(c['frames']))]
   boxes=[];measured=None
   for clip,frame in poses:
    visible=[]
    for part in parts:
     state=next((v for v in reversed(part['states'][clip]) if v[0]<=frame),None) if clip>=0 else None
     if state[4]>.001 if state else part['defaultVisible']:visible.append(part)
    body=[v for v in visible if not v['sourceFlags']&1] or visible
    for part in body:
     reference=str(output/part['mesh'])+(f'#pose={clip}:{frame}' if clip>=0 else '');probe.stdin.write(reference+'\n');probe.stdin.flush();raw=probe.stdout.readline();assert raw,reference;boxes.append(json.loads(raw))
    if boxes:measured=dict(clip=clip,frame=frame);break
   assert boxes,'No visible source geometry: '+b['key'];minimum=[min(v['min'][i] for v in boxes) for i in range(3)];maximum=[max(v['max'][i] for v in boxes) for i in range(3)]
   entry=dict(material=parts[0]['material'],parts=parts,size=[max(.01,maximum[i]-minimum[i]) for i in range(3)],bounds=dict(min=minimum,max=maximum),boundsSource='nativeVisiblePose',boundsPose=measured,realistic=True,classic=True,classicTier=1,classicYaw=0 if b.get('environment') else -1.5707963267948966,sourcePack=pack,sourceModel=model['source'],animations=[dict(name=c['name'],frames=c['frameCount'],duration=c['duration'],loop=c['loop']) for c in model['clips']])
   if b.get('environment'):entry.update(lods=[parts[0]['mesh']]*2,lod_parts=[parts]*2)
   else:entry['worldHeight']=2.55
   catalog[b['key']]=entry
 finally:
  probe.stdin.close();assert probe.wait(timeout=10)==0,'Native pose probe failed'
  # Preserve the copied path spelling on case-sensitive checkouts.
  spelling={path.lower():path for path in files}
  def canonical(value):
   if isinstance(value,str):return spelling.get(value.lower(),value)
   if isinstance(value,list):return [canonical(v) for v in value]
   if isinstance(value,dict):return {k:canonical(v) for k,v in value.items()}
   return value
  normalized={}
  for relative in files:
   relative=spelling[relative.lower()];target=output/relative
   if target.suffix=='.mmat':
    material=json.loads(target.read_bytes());fixed=canonical(material)
    if fixed!=material:target.write_bytes(encode(fixed))
   raw=target.read_bytes();normalized[relative]=dict(path=relative,bytes=len(raw),sha256=sha(raw))
  files=normalized;catalog=canonical(catalog)
 raw=encode(catalog);(output/'model-catalog.json').write_bytes(raw);return sorted(files.values(),key=lambda r:r['path'])

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
  else:raise ValueError('Missing original Warden source: '+path)
  path=path.replace('\\','/');files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,archive=name,bytes=len(raw),sha256=sha(raw)));return raw
 with tempfile.TemporaryDirectory(prefix='frost-warden-') as temp:
  work=pathlib.Path(temp);geometry=work/'geometry';geometry.mkdir();(geometry/'model-catalog.json').write_bytes(encode({}))
  bindings=work/'bindings.json';bindings.write_bytes(encode(dict(models=BINDINGS)));overlay=work/'overlay'
  run('convert-frost-classic-billboards.py','--bindings',bindings,'--output',overlay,'--metadata-reader',args.metadata_reader)
  receipt=dict(files=model_geometry(BINDINGS,overlay,geometry,args.pose_probe))
  for record in receipt['files']:
   raw=(geometry/record['path']).read_bytes();assert sha(raw)==record['sha256'] and len(raw)==record['bytes']
   target=record['path'].replace('Assets/WarcraftIII/','Assets/Warden/')
   if target.endswith('.mmat'):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/Warden/')
   files[target]=raw
  files['warden-models.json']=(geometry/'model-catalog.json').read_bytes().replace(b'Assets/WarcraftIII/',b'Assets/Warden/')
  files['SourceAssets/Warden/node-conversion.json']=(overlay/'asset-sources.json').read_bytes();views={}
  for binding in BINDINGS:
   library=ROOT/'asset-library/warcraft-iii'/binding['pack'];signed=json.loads((library/'asset-sources.json').read_bytes())
   record=next(r for r in signed['sourceFiles'] if r['path'].replace('\\','/').lower()==binding['model'].lower());path=record['path'].replace('\\','/');raw=(library/'SourceAssets'/path).read_bytes()
   assert sha(raw)==record['sha256'] and len(raw)==record['bytes'];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(record,path=path,pack=binding['pack']))
   if binding['key'].endswith('Portrait'):views[binding['key']]=dict(source=path,sourceSha256=sha(raw),**portrait(raw))
  files['warden-portraits.json']=encode(views)
  effects=work/'effects';run('convert-warcraft-effects.py','--output',effects,'--sampler',args.sampler,*[v for n,d in SPELLS for v in ['--source',f'remaining-ready/Abilities/Spells/{d}/{n}.mdx']])
  effect_receipt=json.loads((effects/'asset-sources.json').read_bytes())
  for record in effect_receipt['generatedFiles']:
   if not record['path'].startswith('Assets/') or record['path'].endswith('effect-catalog.json'):continue
   raw=(effects/record['path']).read_bytes();assert sha(raw)==record['sha256'];target=record['path'].replace('Assets/WarcraftIII/','Assets/Warden/')
   if target.endswith(('.meffect','.json')):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/Warden/')
   files[target]=raw
  meshes=json.loads(files['warden-models.json']);art={}
  for effect in json.loads((effects/'Assets/WarcraftIII/effect-catalog.json').read_bytes())['models']:
   name=pathlib.PureWindowsPath(effect['source']).stem
   mesh=meshes.get('ClassicWarden'+name) or dict(parts=[],animations=[dict(name=c['name'],frames=c['frames'],duration=c['duration'],loop=c['loop']) for c in effect['clips']])
   assert [c['name'] for c in effect['clips']]==[c['name'] for c in mesh['animations']]
   art[name]=dict(effect=effect['effect'].replace('Assets/WarcraftIII/','Assets/Warden/'),parts=mesh['parts'],animations=mesh['animations'])
  files['warden-art.json']=encode(art);files['SourceAssets/Warden/effect-conversion.json']=encode(effect_receipt)
  for r in effect_receipt['sourceFiles']:
   raw=(effects/'SourceAssets'/r['path']).read_bytes();assert sha(raw)==r['sha256'] and len(raw)==r['bytes'];path=r['path'].split('/',1)[1];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,pack=r['path'].split('/',1)[0],sha256=r['sha256'],bytes=r['bytes']))
 tables={n:base.rows(original('Units/'+n+'.slk')) for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI','AbilityData','AbilityMetaData']}
 texts={n:original('Units/NightElf'+n+'.txt') for n in ['UnitFunc','UnitStrings','AbilityFunc','AbilityStrings']}
 elf=original('Scripts/elf.ai');original('Scripts/common.ai');misc=original('Units/MiscGame.txt');original('UI/WorldEditStrings.txt');original('UI/UnitEditorData.txt')
 def icons(key,path):
  result={}
  for field,source in [('icon',path),('disabledIcon',path.replace('\\CommandButtons\\BTN','\\CommandButtonsDisabled\\DISBTN').replace('\\PassiveButtons\\PASBTN','\\CommandButtonsDisabled\\DISPASBTN'))]:
   raw=original(source);target='Assets/Art/classic-warden-'+key+('-disabled' if field=='disabledIcon' else '')+'.png';files[target]=base.base.decode_icon(raw);result[field]=target
  return result
 number=lambda value:float(value) if value.strip() not in ['-','_',''] else 0
 units={}
 for key in ['Ewar','espv','even']:
  b,w,ui=[tables[n][key] for n in ['UnitBalance','UnitWeapons','unitUI']];text=texts;f=base.section(text['UnitFunc'],key)
  weapon=dict(damage=number(w['avgdmg1']),dice=int(number(w['dice1'])),sides=int(number(w['sides1'])),bonus=number(w['dmgplus1']),attack=w['atkType1'],range=number(w['rangeN1'])/100,cooldown=number(w['cool1']),damagePoint=number(w['dmgpt1']),backswing=number(w['backSw1']),missileSpeed=number(f.get('Missilespeed','0'))/100,antiAir='air' in w['targs1'].split(','),enabled=number(w['weapsOn'])>0)
  units[key]=dict(sourceUnit=key,label={'Ewar':'Warden','espv':'Avatar of Vengeance','even':'Spirit of Vengeance'}[key],model={'Ewar':'ClassicWarden','espv':'ClassicVengeanceAvatar','even':'ClassicVengeanceSpirit'}[key],portrait={'Ewar':'ClassicWardenPortrait','espv':'ClassicVengeanceAvatarPortrait','even':'ClassicVengeanceSpiritPortrait'}[key],baseHp=number(b['HP']),baseMana=number(b['manaN']),initialMana=number(b['mana0']),baseArmor=number(b['def']),strength=number(b['STR']),agility=number(b['AGI']),intelligence=number(b['INT']),strengthGrowth=number(b['STRplus']),agilityGrowth=number(b['AGIplus']),intelligenceGrowth=number(b['INTplus']),primary=b['Primary'],armor=b['defType'],gold=int(number(b['goldcost'])),wood=int(number(b['lumbercost'])),food=number(b['fused']),time=number(b['bldtm']),speed=number(b['spd'])/100,collision=number(b['collision'])/100,nightRegen=number(b['regenHP']),manaRegen=number(b['regenMana']),modelScale=number(ui['modelScale']),selectionScale=number(ui['scale']),sourceRows={n:tables[n][key] for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI']},sourceFunc=f,sourceStrings=base.section(text['UnitStrings'],key),weapon=weapon,launch=[number(w['launchX'])/100,number(w['launchZ'])/100,-number(w['launchY'])/100],missileArc=number(f.get('MissileArc','0')),**icons(key,f['Art']))
  units[key].update(invulnerable='Avul' in tables['UnitAbilities'][key]['abilList'].split(','),magicImmune='ACmi' in tables['UnitAbilities'][key]['abilList'].split(','),daySight=number(b['sight'])/100,nightSight=number(b['nsight'])/100)
 abilities={}
 for key in ['AEbl','AEfk','AEsh','AEsv','Avng']:
  row=tables['AbilityData'][key];f=base.section(texts['AbilityFunc'],key)
  abilities[key]=dict(sourceRow=row,sourceFunc=f,sourceStrings=base.section(texts['AbilityStrings'],key),levels=[dict(cost=number(row['Cost'+str(n)]),cooldown=number(row['Cool'+str(n)]),range=number(row['Rng'+str(n)])/100,radius=number(row['Area'+str(n)])/100,power=number(row['DataA'+str(n)]),duration=number(row['Dur'+str(n)]),heroDuration=number(row['HeroDur'+str(n)]),interval=number(row['DataB'+str(n)]),data={letter:row.get('Data'+letter+str(n),'') for letter in 'ABCDEF'},castField=number(row['Cast'+str(n)]),**({'unit':row['UnitID'+str(n)]} if key=='AEsv' else {})) for n in range(1,int(row['levels'])+1)],**icons(key,f['Art']))
  if f.get('Researchart'):abilities[key]['researchIcon']=icons(key+'-research',f['Researchart'])['icon']
  if key=='Avng':abilities[key]['offIcon']=icons('vengeance-off',f['Unart'])['icon']
 abilities['ACrk']=dict(sourceRow=tables['AbilityData']['ACrk'])
 skill_builds={};skill={};slots={'BLINK':0,'FAN_KNIVES':1,'SHADOW_TOUCH':2,'VENGEANCE':3}
 for line in elf.decode('utf8').splitlines():
  match=re.match(r'\s*set skill\[\s*(\d+)\]\s*=\s*(\w+)',line)
  if match:skill[int(match[1])]=match[2]
  match=re.match(r'\s*call SetSkillArray\(([123]),WARDEN\)',line)
  if match:skill_builds[{'1':'first','2':'later','3':'third'}[match[1]]]=[slots[skill[n]] for n in range(1,11)]
 assert set(skill_builds)=={'first','later','third'}
 files['warden-rules.json']=encode(dict(author='MiYu',schemaVersion=1,units=units,abilities=abilities,skillBuilds=skill_builds,misc=base.section(misc,'Misc'),originalRuntimeVerified=False,unverified=['Original attribute rounding and full attack-speed behavior','Blink delay, blocked destination and minimum-distance resolution','Fan of Knives total-cap target ordering, sharing and missile timing','Shadow Strike first periodic tick, slowing decay, stacking and immunity','Vengeance corpse faction eligibility, search/cast radius, corpse consumption and summon cap replacement','Original experience award parity']))
 files['Assets/Warden/.gitattributes']=b'* -text whitespace=cr-at-eol\n'
 files['Assets/Licenses/Classic-Warden.txt']=b'Original Warcraft III assets and rules belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source hashes and generators: warden-sources.json.\n'
 tools=['scripts/import-frost-warden.py','scripts/import-frost-demon-hunter.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-dryad-portrait.py','scripts/convert-warcraft-effects.py','scripts/import-frost-druids.py','scripts/import-frost-entangled-assets.py','scripts/import-frost-wisp-rules.py','scripts/import-frost-natures-blessing.py','scripts/warcraft_mpq.py']
 receipt=dict(author='MiYu',generatorHashMode='lf-text',generators={p:sha((ROOT/p).read_bytes().replace(b'\r\n',b'\n')) for p in tools},poseProbeSha256=sha(args.pose_probe.read_bytes()),sources=sources,files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())]);output=args.output.resolve();receipt_path=output/'warden-sources.json';previous=json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {};old={r['path']:r['sha256'] for r in previous.get('files',[])}
 for p,raw in files.items():
  target=output/p;assert not target.exists() or target.read_bytes()==raw or sha(target.read_bytes())==old.get(p),'Preserve modified Warden output: '+p
 for p,raw in files.items():
  target=output/p;target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists() or target.read_bytes()!=raw:target.write_bytes(raw)
 receipt_path.write_bytes(encode(receipt));print('PASS original Warden source import:',len(files),'signed outputs')

if __name__=='__main__':main()

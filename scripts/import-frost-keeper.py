"""Author: MiYu. Reproduce signed original Keeper of the Grove geometry, portraits, icons and rules."""
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
camera=importlib.import_module('import-frost-dryad-portrait')
ROOT,SAMPLE,sha,encode=base.ROOT,base.SAMPLE,base.sha,base.encode
portrait=importlib.import_module('import-frost-demon-hunter').portrait
BINDINGS=[dict(key='ClassicKeeper',source='HeroKeeperoftheGrove',pack='game-ready',model='Units/NightElf/HeroKeeperOfTheGrove/HeroKeeperoftheGrove.mdx'),dict(key='ClassicKeeperPortrait',source='HeroKeeperoftheGrove_Portrait',pack='remaining-ready',model='Units/NightElf/HeroKeeperOfTheGrove/HeroKeeperoftheGrove_Portrait.mdx',environment=True),dict(key='ClassicTreant',source='Ent',pack='game-ready',model='Units/NightElf/Ent/Ent.mdx'),dict(key='ClassicTreantPortrait',source='Ent_Portrait',pack='remaining-ready',model='Units/NightElf/Ent/Ent_Portrait.mdx',environment=True)]
SPELLS=[('EntanglingRootsTarget','NightElf/EntanglingRoots'),('ThornsAura','NightElf/ThornsAura'),('ThornsAuraDamage','NightElf/ThornsAura'),('Tranquility','NightElf/Tranquility'),('TranquilityTarget','NightElf/Tranquility')]
BINDINGS += [dict(key='ClassicKeeper'+n,source=n,pack='remaining-ready',model=f'Abilities/Spells/{d}/{n}.mdx',environment=True) for n,d in SPELLS]+[dict(key='ClassicKeeperMissile',source='KeeperGroveMissile',pack='remaining-ready',model='Abilities/Weapons/KeeperGroveMissile/KeeperGroveMissile.mdx',environment=True)]

def import_tranquility(output,overlay,probe):
 """Preserve all source geometry and alpha tracks; bounds sample the first visible frame."""
 nodes=importlib.import_module('convert-frost-classic-billboards');overrides,_,_=nodes.load_overlay(overlay)
 library=ROOT/'asset-library/warcraft-iii/remaining-ready';signed=json.loads((library/'asset-sources.json').read_bytes());expected={r['path'].lower():r['sha256'] for r in signed['generatedFiles']}
 copied=set()
 def load(path,write=True):
  raw=overrides.get(('remaining-ready',nodes.key(path)))
  if raw is None:
   raw=(library/path).read_bytes();assert sha(raw)==expected[path.lower()],path
  if not write:return raw
  target=output/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw);copied.add(path)
  source=library/(path+'.meta')
  if source.exists():
   raw_meta=source.read_bytes();assert sha(raw_meta)==expected[(path+'.meta').lower()];(output/(path+'.meta')).write_bytes(raw_meta);copied.add(path+'.meta')
  return raw
 catalog=json.loads(load('Assets/WarcraftIII/model-catalog.json',False));model=next(m for m in catalog['models'] if m['id'].lower()=='tranquility');tracks=json.loads(load(model['stateTracks'],False));parts=[]
 for part in model['parts']:
  p=dict(part,mesh=part['animatedMesh'],pivot=[0,0,0],states=[])
  for path in {part['mesh'],part['animatedMesh']}:load(path)
  for path in {part['material'],*part['teamMaterials'].values(),*part['textureMaterials'].values()}:
   mat=json.loads(load(path))
   for slot in ['base_color_texture','normal_texture','metallic_roughness_texture','occlusion_texture','emissive_texture']:
    if mat.get(slot):load(mat[slot])
  for clip in tracks['clips']:
   runs=[];previous=None
   for frame,state in enumerate(clip['frames']):
    geo=state['geosets'][part['geoset']];layer=state['materials'][part['materialIndex']][part['layer']];value=[*geo['color'],geo['alpha']*layer['alpha'],layer['texture']]
    if value!=previous:runs.append([frame,*value]);previous=value
   p['states'].append(runs)
  parts.append(p)
 samples=[]
 for ci,clip in enumerate(tracks['clips']):
  for fi,state in enumerate(clip['frames']):
   visible=[p for p in parts if state['geosets'][p['geoset']]['alpha']*state['materials'][p['materialIndex']][p['layer']]['alpha']>.001]
   if visible:samples=[(ci,fi,p) for p in visible];break
  if samples:break
 assert samples,'Tranquility has no visible source geometry'
 refs=[str(output/p['mesh'])+f'#pose={ci}:{fi}' for ci,fi,p in samples];raw=subprocess.check_output([str(probe),'--stdin'],input=('\n'.join(refs)+'\n').encode());boxes=[json.loads(line) for line in raw.splitlines()];assert len(boxes)==len(samples)
 lo=[min(b['min'][i] for b in boxes) for i in range(3)];hi=[max(b['max'][i] for b in boxes) for i in range(3)]
 entry=dict(material=parts[0]['material'],parts=parts,size=[max(.01,hi[i]-lo[i]) for i in range(3)],bounds=dict(min=lo,max=hi),boundsSource='nativeFirstVisible',boundsClip=ci,boundsFrame=fi,realistic=True,classic=True,classicTier=1,classicYaw=0,sourcePack='remaining-ready',sourceModel=model['source'],animations=[dict(name=c['name'],frames=c['frameCount'],duration=c['duration'],loop=c['loop']) for c in model['clips']],lods=[parts[0]['mesh']]*2,lod_parts=[parts]*2)
 runtime=json.loads((output/'model-catalog.json').read_bytes());runtime['ClassicKeeperTranquility']=entry;(output/'model-catalog.json').write_bytes(encode(runtime))
 receipt=json.loads((output/'classic-sources.json').read_bytes());paths={r['path'] for r in receipt['files']}|copied;receipt['files']=[dict(path=p,bytes=len((output/p).read_bytes()),sha256=sha((output/p).read_bytes())) for p in sorted(paths)];(output/'classic-sources.json').write_bytes(encode(receipt))
 print('PASS original Tranquility geometry:',len(parts),'parts; native bounds clip/frame',ci,fi)

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
  else:raise ValueError('Missing original Keeper of the Grove source: '+path)
  path=path.replace('\\','/');files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,archive=name,bytes=len(raw),sha256=sha(raw)));return raw
 with tempfile.TemporaryDirectory(prefix='frost-keeper-') as temp:
  work=pathlib.Path(temp);geometry=work/'geometry';geometry.mkdir();(geometry/'model-catalog.json').write_bytes(encode({}))
  bindings=work/'bindings.json';bindings.write_bytes(encode(dict(models=BINDINGS)));overlay=work/'overlay'
  geometry_bindings=work/'geometry-bindings.json';geometry_bindings.write_bytes(encode(dict(models=[r for r in BINDINGS if r['source']!='Tranquility'])))
  run('convert-frost-classic-billboards.py','--bindings',geometry_bindings,'--output',overlay,'--metadata-reader',args.metadata_reader)
  run('import-frost-classic.py','--bindings',geometry_bindings,'--output',geometry,'--keys',*[r['key'] for r in BINDINGS if r['source']!='Tranquility'],'--billboard-library',overlay,'--pose-probe',args.pose_probe)
  tranquility_bindings=work/'tranquility-bindings.json';tranquility_bindings.write_bytes(encode(dict(models=[r for r in BINDINGS if r['source']=='Tranquility'])))
  tranquility_overlay=work/'tranquility-overlay';run('convert-frost-classic-billboards.py','--bindings',tranquility_bindings,'--output',tranquility_overlay,'--metadata-reader',args.metadata_reader)
  import_tranquility(geometry,tranquility_overlay,args.pose_probe)
  files['SourceAssets/Keeper/tranquility-node-conversion.json']=(tranquility_overlay/'asset-sources.json').read_bytes()
  receipt=json.loads((geometry/'classic-sources.json').read_bytes())
  for record in receipt['files']:
   raw=(geometry/record['path']).read_bytes();assert sha(raw)==record['sha256'] and len(raw)==record['bytes']
   target=record['path'].replace('Assets/WarcraftIII/','Assets/Keeper/')
   if target.endswith('.mmat'):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/Keeper/')
   files[target]=material_meta(target, raw)
  files['keeper-models.json']=(geometry/'model-catalog.json').read_bytes().replace(b'Assets/WarcraftIII/',b'Assets/Keeper/')
  files['SourceAssets/Keeper/node-conversion.json']=(overlay/'asset-sources.json').read_bytes();views={}
  for binding in BINDINGS:
   library=ROOT/'asset-library/warcraft-iii'/binding['pack'];signed=json.loads((library/'asset-sources.json').read_bytes())
   record=next(r for r in signed['sourceFiles'] if r['path'].replace('\\','/').lower()==binding['model'].lower());path=record['path'].replace('\\','/');raw=(library/'SourceAssets'/path).read_bytes()
   assert sha(raw)==record['sha256'] and len(raw)==record['bytes'];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(record,path=path,pack=binding['pack']))
   if binding['key'].endswith('Portrait'):views[binding['key']]=dict(source=path,sourceSha256=sha(raw),**portrait(raw))
  files['keeper-portraits.json']=encode(views)
  effects=work/'effects';run('convert-warcraft-effects.py','--output',effects,'--sampler',args.sampler,*[v for n,d in SPELLS for v in ['--source',f'remaining-ready/Abilities/Spells/{d}/{n}.mdx']])
  effect_receipt=json.loads((effects/'asset-sources.json').read_bytes())
  for record in effect_receipt['generatedFiles']:
   if not record['path'].startswith('Assets/') or record['path'].endswith('effect-catalog.json'):continue
   raw=(effects/record['path']).read_bytes();assert sha(raw)==record['sha256'];target=record['path'].replace('Assets/WarcraftIII/','Assets/Keeper/')
   if target.endswith(('.meffect','.json')):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/Keeper/')
   files[target]=material_meta(target, raw)
  meshes=json.loads(files['keeper-models.json']);art={}
  for effect in json.loads((effects/'Assets/WarcraftIII/effect-catalog.json').read_bytes())['models']:
   name=pathlib.PureWindowsPath(effect['source']).stem
   mesh=meshes.get('ClassicKeeper'+name) or dict(parts=[],animations=[dict(name=c['name'],frames=c['frames'],duration=c['duration'],loop=c['loop']) for c in effect['clips']])
   assert [c['name'] for c in effect['clips']]==[c['name'] for c in mesh['animations']]
   art[name]=dict(effect=effect['effect'].replace('Assets/WarcraftIII/','Assets/Keeper/'),parts=mesh['parts'],animations=mesh['animations'])
  files['keeper-art.json']=encode(art);files['SourceAssets/Keeper/effect-conversion.json']=encode(effect_receipt)
  for r in effect_receipt['sourceFiles']:
   raw=(effects/'SourceAssets'/r['path']).read_bytes();assert sha(raw)==r['sha256'] and len(raw)==r['bytes'];path=r['path'].split('/',1)[1];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,pack=r['path'].split('/',1)[0],sha256=r['sha256'],bytes=r['bytes']))
 tables={n:base.rows(original('Units/'+n+'.slk')) for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI','AbilityData','AbilityMetaData']}
 texts={n:original('Units/NightElf'+n+'.txt') for n in ['UnitFunc','UnitStrings','AbilityFunc','AbilityStrings']}
 elf=original('Scripts/elf.ai');original('Scripts/common.ai');misc=original('Units/MiscGame.txt');original('UI/WorldEditStrings.txt');original('UI/UnitEditorData.txt')
 def icons(key,path):
  result={}
  for field,source in [('icon',path),('disabledIcon',path.replace('\\CommandButtons\\BTN','\\CommandButtonsDisabled\\DISBTN'))]:
   raw=original(source);target='Assets/Art/classic-keeper-'+key+('-disabled' if field=='disabledIcon' else '')+'.png';files[target]=base.base.decode_icon(raw);result[field]=target
  return result
 number=lambda value:float(value) if value.strip() not in ['-','_',''] else 0
 units={}
 for key in ['Ekee','efon']:
  b,w,ui=[tables[n][key] for n in ['UnitBalance','UnitWeapons','unitUI']];f=base.section(texts['UnitFunc'],key)
  weapon=dict(damage=number(w['avgdmg1']),dice=int(w['dice1']),sides=int(w['sides1']),bonus=number(w['dmgplus1']),attack=w['atkType1'],range=number(w['rangeN1'])/100,cooldown=number(w['cool1']),damagePoint=number(w['dmgpt1']),backswing=number(w['backSw1']),missileSpeed=number(f.get('Missilespeed','0'))/100,antiAir='air' in w['targs1'].split(','))
  if key=='efon':weapon['missileSpeed']=0
  units[key]=dict(sourceUnit=key,label='Keeper of the Grove' if key=='Ekee' else 'Treant',model='ClassicKeeper' if key=='Ekee' else 'ClassicTreant',portrait='ClassicKeeperPortrait' if key=='Ekee' else 'ClassicTreantPortrait',baseHp=number(b['HP']),baseMana=number(b['manaN']),initialMana=number(b['mana0']),baseArmor=number(b['def']),strength=number(b['STR']),agility=number(b['AGI']),intelligence=number(b['INT']),strengthGrowth=number(b['STRplus']),agilityGrowth=number(b['AGIplus']),intelligenceGrowth=number(b['INTplus']),primary=b['Primary'],armor=b['defType'],gold=int(number(b['goldcost'])),wood=int(number(b['lumbercost'])),food=number(b['fused']),time=number(b['bldtm']),speed=number(b['spd'])/100,collision=number(b['collision'])/100,nightRegen=number(b['regenHP']),manaRegen=number(b['regenMana']),modelScale=number(ui['modelScale']),selectionScale=number(ui['scale']),sourceRows={n:tables[n][key] for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI']},sourceFunc=f,sourceStrings=base.section(texts['UnitStrings'],key),weapon=weapon,**icons(key,f['Art']))
 abilities={}
 for key in ['AEer','AEfn','AEah','AEtq']:
  row=tables['AbilityData'][key];f=base.section(texts['AbilityFunc'],key)
  abilities[key]=dict(sourceRow=row,sourceFunc=f,sourceStrings=base.section(texts['AbilityStrings'],key),levels=[dict(cost=number(row['Cost'+str(n)]),cooldown=number(row['Cool'+str(n)]),range=number(row['Rng'+str(n)])/100,radius=number(row['Area'+str(n)])/100,power=number(row['DataA'+str(n)]),duration=number(row['Dur'+str(n)]),heroDuration=number(row['HeroDur'+str(n)]),interval=number(row['DataB'+str(n)])) for n in range(1,int(row['levels'])+1)],**icons(key,f['Art']))
 skill_builds={};skill={};slots={'ENT_ROOTS':0,'FORCE_NATURE':1,'THORNS_AURA':2,'TRANQUILITY':3}
 for line in elf.decode('utf8').splitlines():
  match=re.match(r'\s*set skill\[\s*(\d+)\]\s*=\s*(\w+)',line)
  if match:skill[int(match[1])]=match[2]
  match=re.match(r'\s*call SetSkillArray\(([12]),KEEPER\)',line)
  if match:skill_builds['first' if match[1]=='1' else 'later']=[slots[skill[n]] for n in range(1,11)]
 assert set(skill_builds)=={'first','later'}
 files['keeper-rules.json']=encode(dict(author='MiYu',schemaVersion=1,units=units,abilities=abilities,skillBuilds=skill_builds,misc=base.section(misc,'Misc'),originalRuntimeVerified=False,unverified=['Original attribute rounding and full attack-speed behavior','Entangling Roots attack/spell restrictions','Force of Nature tree ordering, sparse tree counts and placement','Thorns damage basis, damage type and aura linger','Tranquility first pulse, interruption and stacking','Original experience award parity']))
 files['Assets/Keeper/.gitattributes']=b'* -text whitespace=cr-at-eol\n'
 files['Assets/Licenses/Classic-Keeper.txt']=b'Original Warcraft III assets and rules belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source hashes and generators: keeper-sources.json.\n'
 tools=['scripts/import-frost-keeper.py','scripts/import-frost-demon-hunter.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-dryad-portrait.py','scripts/convert-warcraft-effects.py']
 receipt=dict(author='MiYu',generatorHashMode='lf-text',generators={p:sha((ROOT/p).read_bytes().replace(b'\r\n',b'\n')) for p in tools},poseProbeSha256=sha(args.pose_probe.read_bytes()),sources=sources,files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())]);output=args.output.resolve();receipt_path=output/'keeper-sources.json';previous=json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {};old={r['path']:r['sha256'] for r in previous.get('files',[])}
 for p,raw in files.items():
  target=output/p;assert not target.exists() or target.read_bytes()==raw or sha(target.read_bytes())==old.get(p),'Preserve modified Keeper of the Grove output: '+p
 for p,raw in files.items():
  target=output/p;target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists() or target.read_bytes()!=raw:target.write_bytes(raw)
 receipt_path.write_bytes(encode(receipt));print('PASS original Keeper of the Grove source import:',len(files),'signed outputs')

if __name__=='__main__':main()

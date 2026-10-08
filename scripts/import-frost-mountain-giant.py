"""Author: MiYu. Import signed original Mountain Giant models, effects and rules."""
import argparse
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base=importlib.import_module('import-frost-druids')
portrait=importlib.import_module('import-frost-faerie-dragon').portrait_camera
ROOT,SAMPLE,sha,encode=base.ROOT,base.SAMPLE,base.sha,base.encode
BINDINGS=[dict(key='ClassicMountainGiantBody',source='MountainGiant',pack='game-ready',model='Units/NightElf/MountainGiant/MountainGiant.mdx'),dict(key='ClassicMountainGiantPortrait',source='MountainGiant_Portrait',pack='remaining-ready',model='Units/NightElf/MountainGiant/MountainGiant_Portrait.mdx',environment=True),dict(key='ClassicTauntCaster',source='TauntCaster',pack='remaining-ready',model='Abilities/Spells/NightElf/Taunt/TauntCaster.mdx',environment=True)]

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--output',type=pathlib.Path,default=SAMPLE)
 parser.add_argument('--game',type=pathlib.Path,default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
 parser.add_argument('--pose-probe',type=pathlib.Path,default=pathlib.Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'))
 parser.add_argument('--sampler',type=pathlib.Path,default=ROOT/'tmp/warcraft-effects/sentinel-bin/MdxExport.dll')
 parser.add_argument('--metadata-reader',type=pathlib.Path,default=ROOT/'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
 args=parser.parse_args();files,sources,archives={},[],[]
 def run(script,*params):subprocess.run([sys.executable,str(ROOT/'scripts'/script),*map(str,params)],check=True)
 def archive_source(path):
  if not archives:archives.extend((n,base.mpyq.MPQArchive(str(args.game/n),listfile=False)) for n in ['war3.mpq','War3x.mpq','War3xLocal.mpq','War3Patch.mpq'])
  for name,archive in reversed(archives):
   try:raw=base.read_archive(archive,path.replace('/','\\'));break
   except FileNotFoundError:continue
  else:raise ValueError('Missing original Mountain Giant source: '+path)
  path=path.replace('\\','/');files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(path=path,archive=name,bytes=len(raw),sha256=sha(raw)))
  return raw
 with tempfile.TemporaryDirectory(prefix='frost-mountain-giant-') as temp:
  work=pathlib.Path(temp);geometry=work/'geometry';geometry.mkdir();(geometry/'model-catalog.json').write_bytes(encode({}))
  bindings=work/'bindings.json';bindings.write_bytes(encode(dict(models=BINDINGS)));overlay=work/'overlay'
  run('convert-frost-classic-billboards.py','--bindings',bindings,'--output',overlay,'--metadata-reader',args.metadata_reader)
  run('import-frost-classic.py','--bindings',bindings,'--output',geometry,'--keys',*[r['key'] for r in BINDINGS],'--billboard-library',overlay,'--pose-probe',args.pose_probe)
  receipt=json.loads((geometry/'classic-sources.json').read_bytes())
  for record in receipt['files']:
   raw=(geometry/record['path']).read_bytes();assert len(raw)==record['bytes'] and sha(raw)==record['sha256']
   target=record['path'].replace('Assets/WarcraftIII/','Assets/MountainGiant/')
   if target.endswith('.mmat'):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/MountainGiant/')
   files[target]=raw
  files['mountain-giant-models.json']=(geometry/'model-catalog.json').read_bytes().replace(b'Assets/WarcraftIII/',b'Assets/MountainGiant/')
  files['SourceAssets/MountainGiant/node-conversion.json']=(overlay/'asset-sources.json').read_bytes();portraits={}
  for binding in BINDINGS:
   library=ROOT/'asset-library/warcraft-iii'/binding['pack'];signed=json.loads((library/'asset-sources.json').read_bytes())
   record=next(r for r in signed['sourceFiles'] if r['path'].replace('\\','/').lower()==binding['model'].lower());path=record['path'].replace('\\','/');raw=(library/'SourceAssets'/path).read_bytes()
   assert sha(raw)==record['sha256'] and len(raw)==record['bytes'];files['SourceAssets/WarcraftIII/'+path]=raw;sources.append(dict(record,path=path,pack=binding['pack']))
   if binding['key'].endswith('Portrait'):portraits[binding['key']]=dict(source=path,sourceSha256=sha(raw),**portrait(raw))
  files['mountain-giant-portraits.json']=encode(portraits)
  effects=work/'effects';run('convert-warcraft-effects.py','--output',effects,'--sampler',args.sampler,'--source','remaining-ready/Abilities/Spells/NightElf/Taunt/TauntCaster.mdx')
  receipt=json.loads((effects/'asset-sources.json').read_bytes())
  for record in receipt['generatedFiles']:
   if not record['path'].startswith('Assets/') or record['path'].endswith('effect-catalog.json'):continue
   raw=(effects/record['path']).read_bytes();assert sha(raw)==record['sha256'];target=record['path'].replace('Assets/WarcraftIII/','Assets/MountainGiant/')
   if target.endswith(('.meffect','.json')):raw=raw.replace(b'Assets/WarcraftIII/',b'Assets/MountainGiant/')
   files[target]=raw
  effect=json.loads((effects/'Assets/WarcraftIII/effect-catalog.json').read_bytes())['models'][0];mesh=json.loads(files['mountain-giant-models.json'])['ClassicTauntCaster'];assert [c['name'] for c in effect['clips']]==[c['name'] for c in mesh['animations']]
  files['mountain-giant-art.json']=encode(dict(TauntCaster=dict(effect=effect['effect'].replace('Assets/WarcraftIII/','Assets/MountainGiant/'),parts=mesh['parts'],animations=mesh['animations'],clip=0,duration=mesh['animations'][0]['duration'])))
  files['SourceAssets/MountainGiant/effect-conversion.json']=encode(receipt)
 signed={r['path']:r for r in json.loads((SAMPLE/'druid-sources.json').read_bytes())['files']}
 def original(path):
  p='SourceAssets/WarcraftIII/'+path;raw=(SAMPLE/p).read_bytes();record=signed[p];assert sha(raw)==record['sha256'] and len(raw)==record['bytes'];files[p]=raw;sources.append(dict(path=path,bytes=len(raw),sha256=sha(raw),receipt='druid-sources.json'));return raw
 tables={n:base.rows(original('Units/'+n+'.slk')) for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI','AbilityData','AbilityMetaData','UpgradeData']}
 texts={n:original('Units/NightElf'+n+'.txt') for n in ['UnitFunc','UnitStrings','AbilityFunc','AbilityStrings','UpgradeFunc','UpgradeStrings']}
 editor=archive_source('UI/WorldEditStrings.txt');archive_source('Scripts/elf.ai');archive_source('Scripts/common.ai')
 def icons(key,path):
  result={}
  for field,source in [('icon',path),('disabledIcon',path.replace('\\CommandButtons\\BTN','\\CommandButtonsDisabled\\DISBTN'))]:
   raw=archive_source(source);target='Assets/Art/classic-mountain-'+key+('-disabled' if field=='disabledIcon' else '')+'.png';files[target]=base.base.decode_icon(raw);result[field]=target
  return result
 number=lambda value:float(value) if value.strip() not in ['-','_',''] else 0
 b,m,w,ui=[tables[n]['emtg'] for n in ['UnitBalance','UnitData','UnitWeapons','unitUI']];func=base.section(texts['UnitFunc'],'emtg');strings=base.section(texts['UnitStrings'],'emtg')
 weapons={n:dict(damage=float(w['avgdmg'+n]),attack=w['atkType'+n],range=float(w['rangeN'+n])/100,cooldown=float(w['cool'+n]),damagePoint=float(w['dmgpt'+n]),backswing=float(w['backSw'+n]),dice=int(w['dice'+n]),sides=int(w['sides'+n]),bonus=float(w['dmgplus'+n]),targets=w['targs'+n].split(',')) for n in ['1','2']}
 unit=dict(sourceUnit='emtg',label='Mountain Giant',model='ClassicMountainGiantBody',portrait='ClassicMountainGiantPortrait',hp=int(b['HP']),armor=b['defType'],armorValue=float(b['def']),gold=int(b['goldcost']),wood=int(b['lumbercost']),food=number(b['fused']),time=float(b['bldtm']),speed=number(b['spd'])/100,collision=float(b['collision'])/100,modelScale=float(ui['modelScale']),selectionScale=float(ui['scale']),hotkey=strings['Hotkey'],slot=sum(int(v)*f for v,f in zip(func['Buttonpos'].split(','),[1,4])),organic=True,antiAir=False,flying=False,leavesCorpse=bool(int(m['deathType'])&2),corpseUsable=bool(int(m['deathType'])&1),maxMana=number(b['manaN']),nightRegen=float(b['regenHP']),weapons=weapons,sourceRows={n:tables[n]['emtg'] for n in ['UnitBalance','UnitData','UnitWeapons','UnitAbilities','unitUI']},sourceFunc=func,sourceStrings=strings,**weapons['1'],**icons('unit',func['Art']))
 abilities={}
 for key in ['Atau','Agra','Assk','Arsk']:
  f=base.section(texts['AbilityFunc'],key);r=tables['AbilityData'][key];abilities[key]=dict(sourceRow=r,sourceFunc=f,sourceStrings=base.section(texts['AbilityStrings'],key),slot=sum(int(v)*i for v,i in zip(f['Buttonpos'].split(','),[1,4])),cost=number(r['Cost1']),cooldown=number(r['Cool1']),range=number(r['Rng1'])/100,radius=number(r['Area1'])/100,**icons(key,f['Art']))
 research={}
 for key,field in [('Rehs','hardenedSkin'),('Rers','resistantSkin')]:
  f=base.section(texts['UpgradeFunc'],key);r=tables['UpgradeData'][key];research[key]=dict(field=field,gold=int(r['goldbase']),wood=int(r['lumberbase']),time=float(r['timebase']),building='ancientlore',sourceRow=r,sourceFunc=f,sourceStrings=base.section(texts['UpgradeStrings'],key),slot=sum(int(v)*i for v,i in zip(f['Buttonpos'].split(','),[1,4])),**icons(key,f['Art']))
 fields={}
 for line in editor.decode('utf-8',errors='replace').splitlines():
  if line.startswith(('WESTRING_AEVAL_GRA','WESTRING_AEVAL_SSK')):key,value=line.split('=',1);fields[key]=value
 files['mountain-giant-rules.json']=encode(dict(author='MiYu',schemaVersion=1,sourceUnitsPerWorldUnit=100,units=dict(mountaingiant=unit),abilities=abilities,research=research,editorFields=fields,originalRuntimeVerified=False,unverified=['Taunt target priority, visibility and second trigger','War Club attach/detach and attack-count edge semantics','Hardened Skin armor order and magic-attack classification','Full Resistant Skin spell-immunity list']))
 files['Assets/MountainGiant/.gitattributes']=b'* -text whitespace=cr-at-eol\n';files['Assets/Licenses/Classic-MountainGiant.txt']=b'Original Warcraft III assets and rules belong to Blizzard Entertainment. Extraction does not establish a free redistribution license. Source hashes and generators: mountain-giant-sources.json.\n'
 tools=['scripts/import-frost-mountain-giant.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/import-frost-dryad-portrait.py','scripts/import-frost-faerie-dragon.py','scripts/convert-warcraft-effects.py']
 receipt=dict(author='MiYu',generatorHashMode='lf-text',generators={p:sha((ROOT/p).read_bytes().replace(b'\r\n',b'\n')) for p in tools},poseProbeSha256=sha(args.pose_probe.read_bytes()),sources=sources,files=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in sorted(files.items())]);output=args.output.resolve();receipt_path=output/'mountain-giant-sources.json';previous=json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {};old={r['path']:r['sha256'] for r in previous.get('files',[])}
 for p,raw in files.items():target=output/p;assert not target.exists() or target.read_bytes()==raw or sha(target.read_bytes())==old.get(p),'Preserve modified Mountain Giant output: '+p
 for p,raw in files.items():
  target=output/p;target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists() or target.read_bytes()!=raw:target.write_bytes(raw)
 receipt_path.write_bytes(encode(receipt));print('PASS original Mountain Giant art and source rules:',len(files),'signed outputs')

if __name__=='__main__':main()

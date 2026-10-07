"""Author: MiYu. Import signed original Druid spell particles and animated meshes into the sample."""
import argparse
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base=importlib.import_module('import-frost-druids')
ROOT,SAMPLE,sha,encode=base.ROOT,base.SAMPLE,base.sha,base.encode
BINDINGS=[('RoarCaster','BattleRoar'),('RoarTarget','BattleRoar'),('FaerieFireTarget','FaerieFire'),('CycloneTarget','Cyclone')]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=pathlib.Path,default=SAMPLE)
    parser.add_argument('--pose-probe',type=pathlib.Path,default=pathlib.Path('D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe'))
    parser.add_argument('--sampler',type=pathlib.Path,default=ROOT/'tmp/warcraft-effects/sentinel-bin/MdxExport.dll')
    parser.add_argument('--metadata-reader',type=pathlib.Path,default=ROOT/'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    args=parser.parse_args(); files={}; sources=[]; catalog={}
    def run(script,*params):subprocess.run([sys.executable,str(ROOT/'scripts'/script),*map(str,params)],check=True)
    with tempfile.TemporaryDirectory(prefix='frost-druid-spells-') as temp:
        work=pathlib.Path(temp); geometry=work/'geometry';geometry.mkdir();(geometry/'model-catalog.json').write_bytes(encode({}))
        bindings=work/'bindings.json';bindings.write_bytes(encode(dict(models=[dict(key='Classic'+n,source=n,pack='remaining-ready',model=f'Abilities/Spells/NightElf/{d}/{n}.mdx') for n,d in BINDINGS])))
        overlay=work/'overlay';effects=work/'effects'
        run('convert-frost-classic-billboards.py','--bindings',bindings,'--output',overlay,'--metadata-reader',args.metadata_reader)
        run('import-frost-classic.py','--output',geometry,'--keys',*['Classic'+n for n,_ in BINDINGS],'--billboard-library',overlay,'--pose-probe',args.pose_probe)
        run('convert-warcraft-effects.py','--output',effects,'--sampler',args.sampler,*[v for n,d in BINDINGS for v in ['--source',f'remaining-ready/Abilities/Spells/NightElf/{d}/{n}.mdx']])
        mesh_receipt=json.loads((geometry/'classic-sources.json').read_bytes());effect_receipt=json.loads((effects/'asset-sources.json').read_bytes())
        for record in mesh_receipt['files']:
            raw=(geometry/record['path']).read_bytes();assert sha(raw)==record['sha256'] and len(raw)==record['bytes'];files[record['path']]=raw
        meshes=json.loads((geometry/'model-catalog.json').read_bytes())
        for record in effect_receipt['generatedFiles']:
            if not record['path'].startswith('Assets/') or record['path'].startswith('Assets/WarcraftIII/effect-catalog.json'):continue
            raw=(effects/record['path']).read_bytes();assert sha(raw)==record['sha256'] and len(raw)==record['bytes'];files[record['path']]=raw
        effects_catalog=json.loads((effects/'Assets/WarcraftIII/effect-catalog.json').read_bytes())
        for name,_ in BINDINGS:
            model=next(m for m in effects_catalog['models'] if pathlib.PureWindowsPath(m['source']).stem.lower()==name.lower());mesh=meshes['Classic'+name]
            assert [c['name'] for c in model['clips']]==[c['name'] for c in mesh['animations']]
            clip=next((i for i,c in enumerate(mesh['animations']) if c['name'].lower()=='stand'),0)
            catalog[name]=dict(effect=model['effect'],parts=mesh['parts'],animations=mesh['animations'],clip=clip,duration=mesh['animations'][clip]['duration'])
        for record in effect_receipt['sourceFiles']:
            raw=(effects/'SourceAssets'/record['path']).read_bytes();assert sha(raw)==record['sha256'] and len(raw)==record['bytes'];files['SourceAssets/DruidSpells/'+record['path']]=raw;sources.append(record)
        files['SourceAssets/DruidSpells/effect-conversion.json']=encode(effect_receipt)
        files['SourceAssets/DruidSpells/node-conversion.json']=(overlay/'asset-sources.json').read_bytes()
        files['druid-spell-art.json']=encode(catalog)
    buff_path='SourceAssets/WarcraftIII/Units/NightElfAbilityFunc.txt';buff_raw=(SAMPLE/buff_path).read_bytes();signed=json.loads((SAMPLE/'druid-sources.json').read_bytes())
    assert sha(buff_raw)==next(r['sha256'] for r in signed['files'] if r['path']==buff_path)
    files[buff_path]=buff_raw;buffs={key:base.section(buff_raw,key) for key in ['Broa','Brej','Bfae','Bcyc']}
    tools=['scripts/import-frost-druid-spell-art.py','scripts/import-frost-classic.py','scripts/convert-frost-classic-billboards.py','scripts/convert-warcraft-effects.py']
    report=dict(author='MiYu',generators={p:sha((ROOT/p).read_bytes()) for p in tools},buffSource=dict(path=buff_path,sha256=sha(buff_raw),sections=buffs),samplerSha256=sha(args.sampler.read_bytes()),poseProbeSha256=sha(args.pose_probe.read_bytes()),sources=sources,files=[dict(path=p,sha256=sha(raw),bytes=len(raw)) for p,raw in sorted(files.items())])
    output=args.output.resolve();receipt_path=output/'druid-spell-art-sources.json';previous=json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {};old={r['path']:r['sha256'] for r in previous.get('files',[])}
    for p,raw in files.items():
        target=output/p;assert not target.exists() or target.read_bytes()==raw or sha(target.read_bytes())==old.get(p),'Preserve modified Druid spell art: '+p
    for p,raw in files.items():
        target=output/p;target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists() or target.read_bytes()!=raw:target.write_bytes(raw)
    receipt_path.write_bytes(encode(report));print('PASS original Druid spell art:',len(files),'signed outputs')

if __name__=='__main__':main()

"""Author: MiYu. Preserve original Slow Poison flags, autocast defaults and sampled target art."""
import argparse
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base = importlib.import_module('import-frost-druids')
ROOT, SAMPLE, sha, encode = base.ROOT, base.SAMPLE, base.sha, base.encode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=SAMPLE)
    parser.add_argument('--game', type=pathlib.Path, default=pathlib.Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--sampler', type=pathlib.Path, default=ROOT / 'tmp/warcraft-effects/sentinel-bin/MdxExport.dll')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args(); files, sources = {}, []
    signed = json.loads((SAMPLE / 'dryad-sources.json').read_bytes())
    protected = {r['path']: r['sha256'] for r in signed['files']}
    inputs = ['dryad-rules.json', 'SourceAssets/WarcraftIII/Units/NightElfAbilityFunc.txt', 'SourceAssets/WarcraftIII/Units/NightElfAbilityStrings.txt']
    for path in inputs: assert sha((SAMPLE / path).read_bytes()) == protected[path], 'Modified rule input: ' + path
    dryad = json.loads((SAMPLE / inputs[0]).read_bytes()); ability = dryad['abilities']['Aspo']; row = ability['sourceRow']
    assert ability['metadata']['Spo4']['type'] == 'stackFlags'
    archives = [(name, base.mpyq.MPQArchive(str(args.game / name), listfile=False)) for name in ['war3.mpq', 'War3x.mpq', 'War3xLocal.mpq', 'War3Patch.mpq']]
    texts = {}
    for path in ['UI/UnitEditorData.txt', 'UI/WorldEditStrings.txt']:
        for archive_name, archive in reversed(archives):
            try: raw = base.read_archive(archive, path.replace('/', '\\')); break
            except FileNotFoundError: continue
        else: raise ValueError('Missing original editor definition: ' + path)
        files['SourceAssets/SlowPoison/' + pathlib.PurePosixPath(path).name] = raw
        sources.append(dict(path=path, archive=archive_name, bytes=len(raw), sha256=sha(raw)))
        texts[path] = raw
    entries = base.section(texts['UI/UnitEditorData.txt'], 'stackFlags')
    flags = {}
    for name, label in [('damage', 'DAMAGE'), ('movement', 'MOVEMENT'), ('attackRate', 'ATTACKRATE'), ('killUnit', 'KILLUNIT')]:
        key = 'WESTRING_UE_STACKFLAGS_' + label
        matches = [value for index, value in entries.items() if index.isdigit() and value.split(',')[1] == key]
        assert len(matches) == 1
        bit = int(matches[0].split(',')[0]); flags[name] = dict(bit=bit, enabled=bool(int(row['DataD1']) & (1 << bit)), stringKey=key)
    buff_func = (SAMPLE / inputs[1]).read_bytes(); buff_text = (SAMPLE / inputs[2]).read_bytes()
    buffs = {key: dict(sourceFunc=base.section(buff_func, key), sourceStrings=base.section(buff_text, key)) for key in row['BuffID1'].split(',')}
    model = 'Abilities/Weapons/PoisonSting/PoisonStingTarget.mdx'
    assert all(b['sourceFunc']['Targetart'].replace('\\', '/').replace('.mdl', '.mdx') == model for b in buffs.values())
    rules = dict(author='MiYu',schemaVersion=1,ability='Aspo',damagePerSecond=float(row['DataA1']),moveReduction=float(row['DataB1']),attackReduction=float(row['DataC1']),duration=float(row['Dur1']),heroDuration=float(row['HeroDur1']),stackMask=int(row['DataD1']),flags=flags,initialAbolishAutocast='Aadm' in dryad['units']['dryad']['sourceRows']['UnitAbilities']['auto'].split(','),slot=sum(int(v)*f for v,f in zip(ability['sourceFunc']['Buttonpos'].split(','),[1,4])),icon=ability['icon'],sourceRow=row,buffs=buffs,sourceEditorSection=entries,originalRuntimeVerified=False,unverified=['Repeated-hit and multi-attacker attribution','Damage cadence and immunity/dispel interactions'])
    files['slow-poison-rules.json'] = encode(rules)
    with tempfile.TemporaryDirectory(prefix='frost-poison-') as temp:
        work = pathlib.Path(temp)
        subprocess.run([sys.executable,str(ROOT / 'scripts/convert-warcraft-effects.py'),'--output',str(work),'--sampler',str(args.sampler),'--source','remaining-ready/' + model],check=True)
        receipt = json.loads((work / 'asset-sources.json').read_bytes())
        for record in receipt['generatedFiles']:
            if record['path'].endswith('effect-catalog.json'): continue
            raw = (work / record['path']).read_bytes(); assert sha(raw) == record['sha256']
            files[record['path']] = raw
        for record in receipt['sourceFiles']:
            files['SourceAssets/SlowPoison/' + record['path']] = (work / 'SourceAssets' / record['path']).read_bytes()
        catalog = json.loads((work / 'Assets/WarcraftIII/effect-catalog.json').read_bytes())['models']
        assert len(catalog) == 1 and not catalog[0]['metadataOnly']
        effect = catalog[0]; clip = effect['previewClip']; duration = effect['clips'][clip]['duration']
        files['slow-poison-art.json'] = encode(dict(PoisonStingTarget=dict(effect=effect['effect'],clip=clip,duration=duration)))
        files['SourceAssets/SlowPoison/effect-conversion.json'] = encode(receipt)
        sources.extend(receipt['sourceFiles']); sources.extend(receipt['textureSources'])
    files['Assets/Licenses/Classic-SlowPoison.txt'] = b'Original Warcraft III Slow Poison source data and effects belong to Blizzard Entertainment. Source archives, hashes and conversion provenance are recorded in slow-poison-sources.json. Extraction does not establish a free redistribution license.\n'
    tools = ['scripts/import-frost-slow-poison.py', 'scripts/convert-warcraft-effects.py']
    report = dict(author='MiYu',generators={p:sha((ROOT/p).read_bytes()) for p in tools},inputs={p:sha((SAMPLE/p).read_bytes()) for p in inputs},samplerSha256=sha(args.sampler.read_bytes()),sources=sources,files=[dict(path=p,sha256=sha(raw),bytes=len(raw)) for p,raw in sorted(files.items())])
    receipt_path = args.output / 'slow-poison-sources.json'
    previous = json.loads(receipt_path.read_bytes()) if receipt_path.exists() else {}; old = {r['path']:r['sha256'] for r in previous.get('files',[])}
    for path,raw in files.items():
        target=args.output/path
        assert not target.exists() or target.read_bytes()==raw or not args.check and sha(target.read_bytes())==old.get(path), 'Preserve modified Slow Poison output: '+path
        if args.check: assert target.read_bytes()==raw, 'Regeneration mismatch: '+path
    if args.check: assert receipt_path.read_bytes()==encode(report), 'Receipt mismatch'
    else:
        for path,raw in files.items():
            target=args.output/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        receipt_path.write_bytes(encode(report))
    print('PASS Slow Poison source/art:',len(files),'signed outputs; original flags/autocast and reproducible sampled effect')


if __name__ == '__main__': main()

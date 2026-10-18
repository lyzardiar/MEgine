"""Author: MiYu. Retain original Ghoul/Abomination and Crypt/Slaughterhouse base profiles and production cards."""
import argparse
import hashlib
import importlib
import io
import json
from pathlib import Path
from PIL import Image
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
rows = importlib.import_module('import-frost-wisp-rules').rows
section = importlib.import_module('import-frost-human-army').section


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=SAMPLE)
    parser.add_argument('--source-sample', type=Path, default=SAMPLE)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    args = parser.parse_args(); name = 'undead-army-sources.json'; prefix = 'SourceAssets/UndeadArmy/'
    retained_file = args.source_sample / name; retained = json.loads(retained_file.read_bytes()) if retained_file.exists() else {}
    previous_file = args.output / name; previous = json.loads(previous_file.read_bytes()) if previous_file.exists() else {}
    files, sources, archives = {}, {}, []
    for r in previous.get('files', []):
        raw = (args.output / r['path']).read_bytes(); assert len(raw) == r['bytes'] and sha(raw) == r['sha256'], 'Preserve edited output: ' + r['path']

    def original(path):
        if path in sources: return files[prefix + path]
        record = next((r for r in retained.get('sources', []) if r['path'] == path), None)
        if record:
            raw = (args.source_sample / prefix / path).read_bytes(); assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'Corrupt retained source: ' + path
        else:
            assert not retained, 'Missing retained source: ' + path
            if not archives: archives.extend((n, mpyq.MPQArchive(str(args.game / n), listfile=False)) for n in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'])
            for archive_name, archive in archives:
                try: raw = read_archive(archive, path.replace('/', '\\')); break
                except FileNotFoundError: continue
            else: raise FileNotFoundError(path)
            record = dict(path=path, archive=archive_name, bytes=len(raw), sha256=sha(raw))
        files[prefix + path] = raw; sources[path] = record
        return raw

    def icon(key, art, disabled=False):
        path = art.replace('\\', '/')
        if disabled: path = path.replace('/CommandButtons/BTN', '/CommandButtonsDisabled/DISBTN')
        stream = io.BytesIO(); Image.open(io.BytesIO(original(path))).convert('RGBA').save(stream, format='PNG')
        output = 'Assets/Art/classic-undead-army-' + key + ('-disabled' if disabled else '') + '.png'; files[output] = stream.getvalue(); return output

    tables={key:rows(original('Units/'+key+'.slk')) for key in ['UnitBalance','UnitWeapons','UnitUI','UnitAbilities']}
    profiles={}
    num=lambda row,key:float(row.get(key,'0')) if row.get(key,'0').strip() not in ['-','_',''] else 0
    for kind,source,model,mobile in [('ghoul','ugho','RealGhoul',True),('abomination','uabo','RealAbomination',True),('barracks','usep','RevenantBarracks',False),('workshop','uslh','RevenantWorkshop',False)]:
        b,w,ui,a=[tables[key][source] for key in ['UnitBalance','UnitWeapons','UnitUI','UnitAbilities']]
        func,text=[section(original('Units/UndeadUnit'+suffix+'.txt'),source) for suffix in ['Func','Strings']]
        profiles[kind]=dict(sourceUnit=source,model=model,label=text['Name'],hp=int(b['HP']),armor={'large':'heavy','fort':'fortified'}[b['defType']],armorValue=num(b,'def'),gold=int(b['goldcost']),wood=int(b['lumbercost']),food=int(b['fused']) if mobile else 0,time=num(b,'bldtm'),speed=num(b,'spd')/100 if mobile else 0,damage=num(w,'avgdmg1') if mobile else 0,range=num(w,'rangeN1')/100 if mobile else 0,collision=num(b,'collision')/100,healthRegen=num(b,'regenHP') if mobile else 0,regenerationType=b['regenType'],sight=num(b,'sight')/100,nightSight=num(b,'nsight')/100,organic=mobile,attack=w['atkType1'] if mobile else 'normal',antiAir=False,lifesteal=0,slow=0,modelScale=num(ui,'modelScale'),selectionScale=num(ui,'scale'),hotkey=text['Hotkey'],slot=sum(int(v)*n for v,n in zip(func['Buttonpos'].split(','),[1,4])),requires=func.get('Requires','').split(',') if func.get('Requires') else [],sourceRows={key:tables[key][source] for key in ['UnitBalance','UnitWeapons','UnitUI','UnitAbilities']},sourceFunc=func,sourceStrings=text,icon=icon(kind,func['Art']),disabledIcon=icon(kind,func['Art'],True))
        if mobile:profiles[kind].update(cooldown=num(w,'cool1'),damagePoint=num(w,'dmgpt1'),backswing=num(w,'backSw1'),dice=int(w['dice1']),sides=int(w['sides1']),bonus=num(w,'dmgplus1'),mana=0,initialMana=0,manaRegen=0)
    misc=section(original('Units/MiscGame.txt'),'Misc');armor=['light','medium','heavy','fortified','normal','hero','divine','unarmored']
    files['undead-army.json']=encode(dict(author='MiYu',sourceUnitsPerWorldUnit=100,units={k:v for k,v in profiles.items() if v['speed']},buildings={k:v for k,v in profiles.items() if not v['speed']},roster={'barracks':['ghoul'],'workshop':['abomination']},damageTable=dict(normal=dict(zip(armor,map(float,misc['DamageBonusNormal'].split(',')))))))
    files['Assets/Licenses/Classic-Undead-Army.txt']=b'Warcraft III Ghoul, Abomination, Crypt and Slaughterhouse data and command icons: Blizzard Entertainment original game terms. REA upstream https://github.com/morluto/rea; fixed runtime and maintenance: third_party/rea/README-MENGINE.md. Source identities and generated hashes: undead-army-sources.json.\n'
    owned = {r['path'] for r in previous.get('files', [])}
    for path, raw in files.items(): assert not (args.output / path).exists() or (args.output / path).read_bytes() == raw or path in owned, 'Preserve unsigned output: ' + path
    generators = ['scripts/import-frost-undead-army.py', 'scripts/import-frost-wisp-rules.py', 'scripts/import-frost-human-army.py', 'scripts/warcraft_mpq.py']
    receipt = dict(author='MiYu',reusedModels=[dict(key=r['model'],catalog='model-catalog.json',catalogSha256=sha((args.source_sample/'model-catalog.json').read_bytes())) for r in profiles.values()], reaUpstream='https://github.com/morluto/rea', reaVersion='6.5.0', archivePrecedence=['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq'], sources=sorted(sources.values(), key=lambda r: r['path']), generators=[dict(path=p, sha256=sha((ROOT / p).read_bytes())) for p in generators], files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    for path, raw in files.items():
        target = args.output / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    (args.output / name).write_bytes(encode(receipt)); print('PASS original Ghoul/Abomination and Crypt/Slaughterhouse profiles, source attack dice/timing and production cards')


if __name__ == '__main__': main()

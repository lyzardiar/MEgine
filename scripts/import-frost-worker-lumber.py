"""Author: MiYu. Read original lumber strikes, cargo, return abilities and command art from installed MPQs."""
import hashlib
import importlib
import io
import json
import re
import uuid
from pathlib import Path
from PIL import Image
from warcraft_mpq import mpyq, read_archive
ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
GAME = Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne')
sha = lambda raw: hashlib.sha256(raw).hexdigest()
encode = lambda value: (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def main():
    packs = [(name, mpyq.MPQArchive(str(GAME / name), listfile=False)) for name in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq']]
    sources, files = {}, {}
    def original(path, retained=None):
        if path in sources: return files[sources[path]['localPath']]
        for name, pack in packs:
            try: raw = read_archive(pack, path.replace('/', '\\')); break
            except FileNotFoundError: continue
        else: raise FileNotFoundError(path)
        target = retained or 'SourceAssets/WorkerLumber/' + path
        if retained: assert (SAMPLE / retained).read_bytes() == raw, 'Original reference changed: ' + path
        files[target] = raw; sources[path] = dict(path=path, archive=name, localPath=target, bytes=len(raw), sha256=sha(raw)); return raw
    rows = importlib.import_module('import-frost-wisp-rules').rows
    tables = {name: rows(original('Units/' + name + '.slk', 'SourceAssets/WarcraftIII/Units/' + name + '.slk')) for name in ['AbilityData', 'UnitWeapons', 'UnitAbilities']}
    balance = rows(original('Units/UnitBalance.slk', 'SourceAssets/CombatRewards/Units/UnitBalance.slk'))
    meta = rows(original('Units/AbilityMetaData.slk', 'SourceAssets/WorkerRepair/Units/AbilityMetaData.slk'))
    text = original('UI/WorldEditStrings.txt', 'SourceAssets/WorkerRepair/UI/WorldEditStrings.txt').decode('utf-8-sig')
    labels = dict(line.split('=', 1) for line in text.splitlines() if '=' in line)
    section = importlib.import_module('import-frost-human-army').section
    func = section(original('Units/CommonAbilityFunc.txt', 'SourceAssets/WorkerRepair/Units/CommonAbilityFunc.txt'), 'Ahar')
    strings = section(original('Units/CommonAbilityStrings.txt', 'SourceAssets/WorkerRepair/Units/CommonAbilityStrings.txt'), 'Ahar')
    units = {}
    for source, id in [('hpea', 'Ahar'), ('opeo', 'Ahar'), ('ugho', 'Ahrl')]:
        a = tables['AbilityData'][id]; w = tables['UnitWeapons'][source]; assert id in tables['UnitAbilities'][source]['abilList'].split(',') and w['targs2']=='tree' and float(w['cool2'])==float(a['Dur1'])
        units[source] = dict(ability=id, damage=int(a['DataA1']), capacity=int(a['DataB1']), interval=float(w['cool2']), damagePoint=float(w['dmgpt2']), backswing=float(w['backSw2']), range=float(a['Rng1'])/100, weaponRange=float(w['rangeN2'])/100, collision=float(balance[source]['collision'])/100, sourceAbility=a, sourceWeapon=w, sourceAbilities=tables['UnitAbilities'][source])
    depots = {key: dict(abilities=r['abilList'].split(','), gold=any(id in r['abilList'].split(',') for id in ['Argl']), wood=any(id in r['abilList'].split(',') for id in ['Argl','Arlm'])) for key, r in tables['UnitAbilities'].items() if any(id in r['abilList'].split(',') for id in ['Argl','Arlm'])}
    art = {}
    for name, field in [('gather','Art'),('return','Unart')]:
        path='Assets/Art/classic-worker-lumber-' + name + '.png'; raw=original(func[field].replace('\\','/')); image=Image.open(io.BytesIO(raw)).convert('RGBA'); stream=io.BytesIO();image.save(stream,format='PNG',optimize=True);files[path]=stream.getvalue();files[path+'.meta']=encode(dict(schemaVersion=1,guid=str(uuid.uuid5(uuid.NAMESPACE_URL,'mengine/frostbound-realms/'+path)),importer='texture'));art[name]=path
    tree = json.loads((SAMPLE/'night-elf-technology.json').read_bytes())['treeRules']; assert all(r['HP']=='50' for r in tree['sourceRows'].values())
    rules=dict(author='MiYu',sourceUnitsPerWorldUnit=100,units=units,depots=depots,mainBases=[['htow','hkee','hcas'],['ogre','ostr','ofrt'],['etol','etoa','etoe'],['unpl','unp1','unp2']],treeHp=tree['hp'],treeSourceRows=tree['sourceRows'],metadata={key:dict(sourceRow=meta[key],name=labels[meta[key]['displayName']]) for key in ['Har1','Har2','Har3']},sourceFunc=func,sourceStrings=strings,art=art,returnAbilities={k:tables['AbilityData'][k] for k in ['Argl','Arlm']})
    files['worker-lumber.json']=encode(rules);files['Assets/Licenses/Classic-Worker-Lumber.txt']=b'Warcraft III lumber/return ability and command textures: Blizzard Entertainment original game terms. Original files, archives, SHA256 and generator: worker-lumber-sources.json. Extraction grants no redistribution license.\n'
    receipt=SAMPLE/'worker-lumber-sources.json';old=json.loads(receipt.read_bytes()) if receipt.exists() else {};known={r['path']:r['sha256'] for r in old.get('outputs',[])}
    for path,raw in files.items():
        target=SAMPLE/path
        if target.exists() and target.read_bytes()!=raw:assert sha(target.read_bytes())==known.get(path),'Preserve modified file: '+path
    for path,raw in files.items():
        target=SAMPLE/path;target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists() or target.read_bytes()!=raw:target.write_bytes(raw)
    receipt.write_bytes(encode(dict(author='MiYu',generator='scripts/import-frost-worker-lumber.py',gameDirectory=str(GAME),sources=list(sources.values()),dependencies=[dict(path='night-elf-technology.json',sha256=sha((SAMPLE/'night-elf-technology.json').read_bytes()))],outputs=[dict(path=p,bytes=len(raw),sha256=sha(raw)) for p,raw in files.items() if p.startswith('Assets/') or p=='worker-lumber.json'],profileSha256=sha(files['worker-lumber.json']),reaEvidence='tmp/docs-artifacts/frost-worker-lumber/worker-lumber-rea.json',originalRuntimeVerified=False)))
    print('PASS original Ahar/Ahrl strikes/cargo/weapon2, 50 HP trees and Argl/Arlm depots')


if __name__=='__main__':main()

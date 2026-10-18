"""Author: MiYu. Import original worker repair abilities, classifications and command art from installed MPQs."""
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
    archives = [(name, mpyq.MPQArchive(str(GAME / name), listfile=False)) for name in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq']]
    sources, files = {}, {}
    def original(path, retained=None):
        if path in sources: return files[sources[path]['localPath']]
        for name, archive in archives:
            try: raw = read_archive(archive, path.replace('/', '\\')); break
            except FileNotFoundError: continue
        else: raise FileNotFoundError(path)
        target = retained or 'SourceAssets/WorkerRepair/' + path
        if retained: assert (SAMPLE / retained).read_bytes() == raw, 'Original reference changed: ' + path
        sources[path] = dict(path=path, archive=name, localPath=target, bytes=len(raw), sha256=sha(raw)); files[target] = raw
        return raw
    rows = importlib.import_module('import-frost-wisp-rules').rows
    ability = rows(original('Units/AbilityData.slk', 'SourceAssets/WarcraftIII/Units/AbilityData.slk'))
    balance = rows(original('Units/UnitBalance.slk', 'SourceAssets/CombatRewards/Units/UnitBalance.slk'))
    units = rows(original('Units/UnitAbilities.slk', 'SourceAssets/WarcraftIII/Units/UnitAbilities.slk'))
    metadata = rows(original('Units/AbilityMetaData.slk'))
    text = original('UI/WorldEditStrings.txt').decode('utf-8-sig')
    labels = {key: re.search(r'^' + metadata[key]['displayName'] + r'=(.*)$', text, re.M)[1].strip() for key in ['Rep1', 'Rep2', 'Rep3', 'Rep4', 'Rep5']}
    def section(raw, key):
        body = re.search(rb'^\[' + key.encode() + rb'\][\r\n]+(.*?)(?=^\[|\Z)', raw, re.M | re.S)[1]
        return dict(line.split('=', 1) for line in body.decode('utf-8-sig').splitlines() if '=' in line and not line.startswith('//'))
    abilities = {}
    for source, id, race, base in [('hpea', 'Ahrp', 'Common', 'Arep'), ('opeo', 'Arep', 'Common', 'Arep'), ('ewsp', 'Aren', 'NightElf', 'Aren'), ('uaco', 'Arst', 'Undead', 'Arst')]:
        assert id in units[source]['abilList'].split(',')
        row = ability[id]; func = section(original('Units/' + race + 'AbilityFunc.txt'), base); strings = section(original('Units/' + race + 'AbilityStrings.txt'), base)
        icon = 'Assets/Art/classic-worker-' + id + '.png'; image = Image.open(io.BytesIO(original(func['Art'].replace('\\', '/')))).convert('RGBA'); stream = io.BytesIO(); image.save(stream, format='PNG', optimize=True); files[icon] = stream.getvalue(); files[icon + '.meta'] = encode(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/frostbound-realms/' + icon)), importer='texture'))
        abilities[source] = dict(id=id, costRatio=float(row['DataA1']), timeRatio=float(row['DataB1']), range=float(row['Rng1']) / 100, navalRangeBonus=float(row['DataE1']) / 100, targets=row['targs1'].split(','), icon=icon, sourceRow=row, sourceFunc=func, sourceStrings=strings, sourceAbilities=units[source])
    classifications = {key: dict(mechanical='mechanical' in r['type'].lower().split(','), ancient='ancient' in r['type'].lower().split(','), building=r['isbldg']=='1') for key, r in balance.items()}
    profile = dict(author='MiYu', sourceUnitsPerWorldUnit=100, abilities=abilities, classifications=classifications, metadata={key:dict(sourceRow=metadata[key], name=labels[key]) for key in labels})
    files['worker-repair.json'] = encode(profile)
    files['Assets/Licenses/Classic-Worker-Repair.txt'] = b'Original Warcraft III worker repair data and command textures: Blizzard Entertainment original game asset terms apply. Source archives, paths, SHA-256 and generator are retained in worker-repair-sources.json. Extraction does not grant redistribution rights.\n'
    previous = SAMPLE / 'worker-repair-sources.json'; old = json.loads(previous.read_bytes()) if previous.exists() else {}; known = {r['path']:r['sha256'] for r in old.get('outputs', [])}
    for path, raw in files.items():
        target = SAMPLE / path
        if target.exists() and target.read_bytes()!=raw: assert sha(target.read_bytes())==known.get(path), 'Preserve modified file: ' + path
    for path, raw in files.items():
        target = SAMPLE / path; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes()!=raw: target.write_bytes(raw)
    manifest = dict(author='MiYu', generator='scripts/import-frost-worker-repair.py', gameDirectory=str(GAME), sources=list(sources.values()), profileSha256=sha(files['worker-repair.json']), outputs=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in files.items() if p.startswith('Assets/') or p=='worker-repair.json'], reaEvidence='tmp/docs-artifacts/frost-worker-repair/worker-repair-rea.json', originalRuntimeVerified=False, license='Blizzard Entertainment original game terms')
    previous.write_bytes(encode(manifest)); print('PASS four original repair profiles: 35% cost, 150% build time, 50 range and source classifications/icons')


if __name__ == '__main__': main()

"""Author: MiYu. Compare live worker base values with authenticated original unit rows."""
import hashlib
import importlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
rows = importlib.import_module('import-frost-wisp-rules').rows
raw = (SAMPLE / 'SourceAssets/CombatRewards/Units/UnitBalance.slk').read_bytes()
manifest = json.loads((SAMPLE / 'combat-rewards-sources.json').read_text(encoding='utf-8'))
record = next(s for s in manifest['sources'] if s['path'] == 'Units/UnitBalance.slk')
assert hashlib.sha256(raw).hexdigest() == record['sha256']
table = rows(raw)
script = """
const S=require('./samples/frostbound-realms/game/simulation.js'),P=require('./samples/frostbound-realms/game/paladin.js');
console.log(JSON.stringify([0,1,2,3].map(f=>{const s=S.create('skirmish',{factions:[f,0]}),u=s.units.find(u=>u.kind==='worker'&&u.team===0),d=S.unitType(u);return {faction:f,source:P.source(s,u),hp:u.maxHp,gold:d.gold,wood:d.wood,time:d.time,food:d.food,speed:u.speed,armorValue:u.armorValue};})));
"""
workers = json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT, text=True, encoding='utf-8'))
checks, differences = [], []
fields = dict(hp='HP', gold='goldcost', wood='lumbercost', time='bldtm', food='fused', speed='spd', armorValue='def')
for worker in workers:
    reference = {name: float(table[worker['source']][column]) / (100 if name == 'speed' else 1) for name, column in fields.items()}
    mismatches = {name: dict(actual=worker[name], expected=reference[name]) for name in fields if worker[name] != reference[name]}
    checks.append(dict(faction=worker['faction'], source=worker['source'], actual={name: worker[name] for name in fields}, expected=reference, mismatches=mismatches))
    differences.extend(dict(faction=worker['faction'], source=worker['source'], field=name, **values) for name, values in mismatches.items())
report = dict(author='MiYu', passed=not differences, reference=dict(path=record['path'], archive=record['archive'], sha256=record['sha256']), checks=checks, differences= differences)
output = ROOT / 'tmp/docs-artifacts/frost-worker-balance/worker-base-parity.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(dict(passed=report['passed'], workers=len(checks), mismatches=len(differences), report=str(output)), ensure_ascii=True))
sys.exit(0 if report['passed'] else 1)

"""Author: MiYu. Resolve the installed local multiplayer browser from its original FDF."""
import hashlib
import importlib
import json
from pathlib import Path

layout = importlib.import_module('extract-frost-warcraft-options')
project = layout.ROOT/'samples/frostbound-realms'
result = layout.extract(project, 'LocalMultiplayerJoin', {'join':'LocalMultiplayerJoin'}, {'TEXT','BACKDROP','GLUETEXTBUTTON','EDITBOX'}, ('GameListContainer','MapInfoPaneContainer','AdvancedOptionsContainer'))
result['generator'] = 'scripts/extract-frost-warcraft-lan.py'
result['generatorSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
result['sources'].append(dict(path='../../scripts/extract-frost-warcraft-options.py', sha256=hashlib.sha256(Path(layout.__file__).read_bytes()).hexdigest()))
result['limitations'] = result['limitations'][:2] + ['Runtime-populated game rows and map information are not positioned by LocalMultiplayerJoin.fdf; these contents require separate source/runtime verification.', 'The source browser layout does not imply Warcraft UDP discovery or protocol compatibility.']
target = project/'warcraft-lan-layout.json'
target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(output=str(target),frames=len(result['pages']['join']),unresolved=result['unresolved']),ensure_ascii=False))
raise SystemExit(1 if result['unresolved'] else 0)

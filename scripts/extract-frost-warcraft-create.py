"""Author: MiYu. Resolve the installed local multiplayer creation page from its original FDF."""
import hashlib
import importlib
import json
from pathlib import Path

layout = importlib.import_module('extract-frost-warcraft-options')
project = layout.ROOT/'samples/frostbound-realms'
containers = ('MapListContainer', 'MapInfoPaneContainer', 'AdvancedOptionsPaneContainer', 'GameSpeedSliderBackdrop', 'MapInfoBackdrop', 'AdvancedOptionsBackdrop', 'PlayBackdrop', 'CancelBackdrop')
result = layout.extract(project, 'LocalMultiplayerCreate', {'create':'LocalMultiplayerCreate'}, {'TEXT', 'GLUETEXTBUTTON', 'SLIDER'}, containers)
result['generator'] = 'scripts/extract-frost-warcraft-create.py'
result['generatorSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
result['sources'].append(dict(path='../../scripts/extract-frost-warcraft-options.py', sha256=hashlib.sha256(Path(layout.__file__).read_bytes()).hexdigest()))
result['limitations'] = result['limitations'][:2] + ['Map rows and map summary are supplied by the runtime; the source containers do not define their internal arrangement.', 'The current server uses a fixed simulation speed. The source slider and advanced options are disabled until supported by the network simulation.']
target = project/'warcraft-create-layout.json'
target.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
print(json.dumps(dict(output=str(target), frames=len(result['pages']['create']), unresolved=result['unresolved']), ensure_ascii=False))
raise SystemExit(1 if result['unresolved'] else 0)

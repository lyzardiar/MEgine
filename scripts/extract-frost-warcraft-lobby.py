"""Author: MiYu. Preserve source lobby anchors, slot metrics and REA-confirmed font settings."""
import hashlib
import importlib
import json
import re
import struct
from pathlib import Path

layout = importlib.import_module('extract-frost-warcraft-options')
project = layout.ROOT/'samples/frostbound-realms'
result = layout.extract(project, 'GameChatroom', {'lobby':'GameChatroom'}, {'TEXT','GLUETEXTBUTTON','TEXTAREA','SLASHCHATBOX'}, ('TeamSetupContainer','MapInfoPaneContainer','AdvancedOptionsContainer','StartGameBackdrop','CancelBackdrop'))
result['generator'] = 'scripts/extract-frost-warcraft-lobby.py'
result['generatorSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
extra = ['../../scripts/extract-frost-warcraft-options.py','SourceAssets/WarcraftUI/UI/MiscUI.txt','SourceAssets/WarcraftUI/UI/FrameDef/Glue/PlayerSlot.fdf']
for name in extra:
    result['sources'].append(dict(path=name,sha256=hashlib.sha256((project/name).read_bytes()).hexdigest()))
config = (project/extra[1]).read_text(encoding='utf-8-sig')
result['fonts'] = {key:float(re.search(r'^'+key+r'=([\d.]+)',config,re.M)[1])*layout.SCALE for key in ['ChatroomTextArea','ChatroomChatEditBox','ChatroomHeaders']}
frames = layout.parse_frames((project/extra[2]).read_text(encoding='utf-8-sig'),extra[2])
slot = next(frame for frame in frames if frame.name=='PlayerSlot')
props = {frame.name:frame.properties for frame in slot.children}
width = lambda name:props[name]['Width'][0][0]*layout.SCALE
result['slot'] = dict(height=slot.properties['Height'][0][0]*layout.SCALE,headerHeight=result['fonts']['ChatroomHeaders']+struct.unpack('<f',bytes.fromhex('a69b443b'))[0]*layout.SCALE,columns={name:width(name) for name in ['DownloadValue','NameMenu','RaceMenu','TeamButton','ColorButton','HandicapMenu']},nameInset=props['NameMenu']['SetPoint'][0][3]*layout.SCALE)
dictionary=layout.strings((project/'SourceAssets/WarcraftUI/UI/FrameDef/GlobalStrings.fdf').read_text(encoding='utf-8-sig'))
result['strings']={key:dictionary[key] for key in ['TEAM_FORMAT','COLON_OBSERVERS','COMPUTER_NORMAL','OPEN','HUMAN','ORC','UNDEAD','NIGHT_ELF']}
chatroom=layout.parse_frames((project/'SourceAssets/WarcraftUI/UI/FrameDef/Glue/GameChatroom.fdf').read_text(encoding='utf-8-sig'),'GameChatroom')[0]
result['chatMaxLines']=int(next(frame for frame in chatroom.children if frame.name=='ChatTextArea').properties['TextAreaMaxLines'][0][0])
result['runtimeEvidence']=dict(binarySha256='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a',initialization='0x6f2bcd60',teamArrangement='0x6f2998f0',headerExtraHeightAddress='0x6f97b458',headerExtraHeightBytes='a69b443b',probe='scripts/probe-frost-rea-lobby.mjs')
result['limitations']=result['limitations'][:2]+['Slot grouping follows confirmed team order and source row/header metrics; full native force policy, observer controls, race/color/handicap menus and map detail internals remain pending.','The room service currently supports two gameplay seats; this layout does not make its protocol equivalent to Warcraft multiplayer.','Chat keeps 128 messages; original scrollbar, line wrapping and slash-command behavior remain pending.']
target=project/'warcraft-lobby-layout.json'
target.write_bytes((json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode())
print(json.dumps(dict(frames=len(result['pages']['lobby']),unresolved=result['unresolved']),ensure_ascii=False))
raise SystemExit(1 if result['unresolved'] else 0)

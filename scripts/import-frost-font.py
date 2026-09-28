"""MiYu: derive the regular game font from the recorded OFL variable source.

Requires fonttools==4.61.1. Download URLs and hashes are in font-sources.json.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[1] / 'samples/frostbound-realms'
source = root / 'SourceAssets/NotoSansSC-VF.ttf'
font = TTFont(source, recalcTimestamp=False)
instantiateVariableFont(font, {'wght': 400}, inplace=True)
font.save(root / 'Assets/Fonts/NotoSansSC.ttf')

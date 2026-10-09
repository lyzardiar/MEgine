"""Author: MiYu. Reproduce original Tauren Chieftain spells and embedded model emitters."""
import importlib

BINDINGS = [
    ('ShockwaveMissile', 'Abilities/Spells/Orc/Shockwave/ShockwaveMissile.mdx'),
    ('WarStompCaster', 'Abilities/Spells/Orc/WarStomp/WarStompCaster.mdx'),
    ('CommandAura', 'Abilities/Spells/Orc/CommandAura/CommandAura.mdx'),
    ('ReincarnationTarget', 'Abilities/Spells/Orc/Reincarnation/ReincarnationTarget.mdx'),
    ('ClassicTaurenChieftainEmbedded', 'Units/Orc/HeroTaurenChieftain/HeroTaurenChieftain.mdx'),
]


if __name__ == '__main__':
    importlib.import_module('import-frost-blademaster-effects').main(dict(description=__doc__, label='original Tauren Chieftain effects', runtimeIntegrated=False, source='Original Warcraft III Tauren Chieftain effects', bindings=BINDINGS, receipt='tauren-effects-sources.json', prefix='Assets/TaurenEffects/', raw='SourceAssets/Tauren/effects/', artFile='tauren-effects.json', modelsFile='tauren-effect-models.json', licenseFile='Assets/Licenses/Tauren-Effects-W3ModelViewer-MIT.txt', sampler='tmp/warcraft-effects/farseer-bin/MdxExport.dll', generators=['scripts/import-frost-tauren-effects.py', 'scripts/warcraft-assets/EffectExport.cs', 'scripts/warcraft-assets/MdxExport.csproj']))

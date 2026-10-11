"""Author: MiYu. Reproduce original Dispel Magic and Inner Fire effects."""
import importlib

if __name__ == '__main__':
    importlib.import_module('import-frost-blademaster-effects').main(dict(description=__doc__, label='original Priest spell effects', runtimeIntegrated=True, source='Original Warcraft III Dispel Magic and Inner Fire effects', bindings=[('DispelMagicTarget', 'Abilities/Spells/Human/DispelMagic/DispelMagicTarget.mdx'), ('InnerFireTarget', 'Abilities/Spells/Human/InnerFire/InnerFireTarget.mdx')], receipt='human-priest-effects-sources.json', prefix='Assets/HumanPriestEffects/', raw='SourceAssets/HumanPriestEffects/', artFile='human-priest-effects.json', modelsFile='human-priest-effect-models.json', licenseFile='Assets/Licenses/Human-Priest-Effects-W3ModelViewer-MIT.txt', generators=['scripts/import-frost-human-priest-effects.py','scripts/warcraft-assets/EffectExport.cs','scripts/warcraft-assets/MdxExport.csproj']))

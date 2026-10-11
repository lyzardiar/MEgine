"""Author: MiYu. Reproduce original Priest Heal and Sorceress Slow spell and buff art."""
import importlib

BINDINGS = [('HealTarget', 'Abilities/Spells/Human/Heal/HealTarget.mdx'), ('SlowCaster', 'Abilities/Spells/Human/Slow/SlowCaster.mdx'), ('SlowTarget', 'Abilities/Spells/Human/Slow/SlowTarget.mdx')]

if __name__ == '__main__':
    importlib.import_module('import-frost-blademaster-effects').main(dict(description=__doc__, label='original Human Sanctum effects', runtimeIntegrated=True, source='Original Warcraft III Priest Heal and Sorceress Slow effects', bindings=BINDINGS, particleOnly=['SlowTarget'], receipt='human-sanctum-effects-sources.json', prefix='Assets/HumanSanctumEffects/', raw='SourceAssets/HumanSanctumEffects/', artFile='human-sanctum-effects.json', modelsFile='human-sanctum-effect-models.json', licenseFile='Assets/Licenses/Human-Sanctum-Effects-W3ModelViewer-MIT.txt', generators=['scripts/import-frost-human-sanctum-effects.py','scripts/warcraft-assets/EffectExport.cs','scripts/warcraft-assets/MdxExport.csproj']))

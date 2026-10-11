"""Author: MiYu. Reproduce original Mortar projectile, Flare caster and Fragmentation impact art."""
import importlib

BINDINGS = [
    ('MortarMissile', 'Abilities/Weapons/Mortar/MortarMissile.mdx'),
    ('FlareCaster', 'Abilities/Spells/Human/Flare/FlareCaster.mdx'),
    ('FragmentationImpact', 'Abilities/Weapons/FlyingMachine/FlyingMachineImpact.mdx'),
]


if __name__ == '__main__':
    importlib.import_module('import-frost-blademaster-effects').main(dict(description=__doc__, label='original Mortar and Flare effects', runtimeIntegrated=False, source='Original Warcraft III Mortar and Flare effects', bindings=BINDINGS, receipt='human-mortar-effects-sources.json', prefix='Assets/HumanMortar/', raw='SourceAssets/HumanMortar/effects/', artFile='human-mortar-effects.json', modelsFile='human-mortar-effect-models.json', licenseFile='Assets/Licenses/Human-Mortar-Effects-W3ModelViewer-MIT.txt', generators=['scripts/import-frost-human-mortar-effects.py','scripts/warcraft-assets/EffectExport.cs','scripts/warcraft-assets/MdxExport.csproj']))

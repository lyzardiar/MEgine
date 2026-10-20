"""Author: MiYu. Preserve original Arcane Tower missile, Feedback impact and Reveal caster effects."""
import importlib

BINDINGS = [('ArcaneTowerMissile', 'Abilities/Spells/Undead/OrbOfDeath/OrbOfDeathMissile.mdx'), ('ArcaneTowerFeedback', 'Abilities/Spells/Human/Feedback/ArcaneTowerAttack.mdx'), ('ArcaneTowerReveal', 'Abilities/Spells/Items/AIta/CrystalBallCaster.mdx')]

if __name__ == '__main__':
    importlib.import_module('import-frost-blademaster-effects').main(dict(description=__doc__, label='original Arcane Tower effects', runtimeIntegrated=True, source='Original Warcraft III Arcane Tower missile, Feedback and Reveal effects', bindings=BINDINGS, particleOnly=['ArcaneTowerFeedback'], receipt='arcane-tower-effects-sources.json', prefix='Assets/ArcaneTowerEffects/', raw='SourceAssets/ArcaneTowerEffects/', artFile='arcane-tower-effects.json', modelsFile='arcane-tower-effect-models.json', licenseFile='Assets/Licenses/Arcane-Tower-Effects-W3ModelViewer-MIT.txt', generators=['scripts/import-frost-arcane-tower-effects.py','scripts/warcraft-assets/EffectExport.cs','scripts/warcraft-assets/MdxExport.csproj']))

"""Author: MiYu. Preserve original Gryphon, Dragonhawk, Cloud and Aerial Shackles effects."""
import importlib

BINDINGS = [
    ('GryphonMissile', 'Abilities/Weapons/GryphonRiderMissile/GryphonRiderMissile.mdx'),
    ('GryphonImpact', 'Abilities/Weapons/GryphonRiderMissile/GryphonRiderMissileTarget.mdx'),
    ('DragonHawkMissile', 'Abilities/Weapons/DragonHawkMissile/DragonHawkMissile.mdx'),
    ('CloudOfFog', 'Abilities/Spells/Human/CloudOfFog/CloudOfFog.mdx'),
    ('AerialShacklesTarget', 'Abilities/Spells/Human/AerialShackles/AerialShacklesTarget.mdx'),
    ('KingdomGryphonAviaryEmbedded', 'Buildings/Human/GryphonAviary/GryphonAviary.mdx'),
    ('ClassicGryphonEmbedded', 'Units/Human/GryphonRider/GryphonRider.mdx'),
    ('ClassicDragonHawkEmbedded', 'Units/Human/BloodElfDragonHawk/BloodElfDragonHawk.mdx')]

if __name__ == '__main__':
    particles = {'SharedModels/' + name + '.mdl': ('human-aviary-particle-models.json', 'Aviary' + name) for name in ['Feather2', 'Bones1', 'Gutz1', 'Feather1']}
    importlib.import_module('import-frost-blademaster-effects').main(dict(description=__doc__, label='original Human Aviary effects', runtimeIntegrated=True, continuousEffects=['CloudOfFog'], sampler='tmp/warcraft-effects/aviary-bin/MdxExport.dll', source='Original Warcraft III Human Aviary weapons, spells and embedded emitters', bindings=BINDINGS, particleOnly=['GryphonImpact', 'DragonHawkMissile', 'CloudOfFog'], particleModels=particles, dependencyReceipts=['human-aviary-particle-sources.json'], receipt='human-aviary-effects-sources.json', prefix='Assets/HumanAviaryEffects/', raw='SourceAssets/HumanAviaryEffects/', artFile='human-aviary-effects.json', modelsFile='human-aviary-effect-models.json', licenseFile='Assets/Licenses/Human-Aviary-Effects-W3ModelViewer-MIT.txt', generators=['scripts/import-frost-human-aviary-effects.py', 'scripts/warcraft-assets/EffectExport.cs', 'scripts/warcraft-assets/Program.cs', 'scripts/warcraft-assets/MdxExport.csproj']))

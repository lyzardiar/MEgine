"""Author: MiYu. Reproduce original Far Seer weapon, spell and embedded sampled effects."""
import importlib

BINDINGS = [
    ('FarSight', 'Abilities/Spells/Other/Andt/Andt.mdx'),
    ('FeralSpiritTarget', 'Abilities/Spells/Orc/FeralSpirit/feralspirittarget.mdx'),
    ('FeralSpiritDone', 'Abilities/Spells/Orc/FeralSpirit/feralspiritdone.mdx'),
    ('LightningBoltMissile', 'Abilities/Spells/Orc/LightningBolt/LightningBoltMissile.mdx'),
    ('BoltImpact', 'Abilities/Weapons/Bolt/BoltImpact.mdx'),
    ('EarthquakeTarget', 'Abilities/Spells/Orc/EarthQuake/EarthquakeTarget.mdx'),
    ('EarthquakeSlow', 'Abilities/Spells/Orc/StasisTrap/StasisTotemTarget.mdx'),
    ('FarseerMissile', 'Abilities/Weapons/FarseerMissile/FarseerMissile.mdx'),
    ('ClassicFarSeerEmbedded', 'Units/Orc/HeroFarseer/HeroFarSeer.mdx'),
    ('ClassicSpiritWolfEmbedded', 'Units/Orc/Spiritwolf/Spiritwolf.mdx'),
]


if __name__ == '__main__':
    importlib.import_module('import-frost-blademaster-effects').main(dict(description=__doc__, label='original Far Seer effects', runtimeIntegrated=False, source='Original Warcraft III Far Seer effects', bindings=BINDINGS, receipt='farseer-effects-sources.json', prefix='Assets/FarseerEffects/', raw='SourceAssets/Farseer/effects/', artFile='farseer-effects.json', modelsFile='farseer-effect-models.json', licenseFile='Assets/Licenses/Farseer-Effects-W3ModelViewer-MIT.txt', sampler='tmp/warcraft-effects/farseer-bin/MdxExport.dll', particleModels={'SharedModels/Lightning2.mdl': ('farseer-particle-models.json', 'ClassicLightningParticle')}, dependencyReceipts=['farseer-particle-sources.json'], generators=['scripts/import-frost-farseer-effects.py', 'scripts/warcraft-assets/EffectExport.cs', 'scripts/warcraft-assets/MdxExport.csproj']))

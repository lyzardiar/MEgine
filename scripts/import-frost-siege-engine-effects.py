"""Author: MiYu. Preserve Siege Engine instant hit, rocket and embedded effects."""
import importlib

BINDINGS = [('SiegeEngineImpact','Abilities/Weapons/SteamTank/SteamTankImpact.mdx'),('SiegeEngineRocket','Abilities/Weapons/RocketMissile/RocketMissile.mdx'),('ClassicSiegeEngineEmbedded','Units/Human/WarWagon/WarWagon_V1.mdx'),('ClassicSiegeEnginePortraitEmbedded','Units/Human/WarWagon/WarWagon_V1_portrait.mdx')]

if __name__=='__main__':
    import tempfile
    from pathlib import Path
    work=Path(__file__).resolve().parents[1]/'tmp/docs-artifacts/frost-siege-engine';work.mkdir(parents=True,exist_ok=True)
    temporary_directory=tempfile.TemporaryDirectory
    tempfile.TemporaryDirectory=lambda **options:temporary_directory(**{**options,'dir':work})
    importlib.import_module('import-frost-blademaster-effects').main(dict(description=__doc__,label='original Siege Engine effects',runtimeIntegrated=True,source='Original Warcraft III Siege Engine impacts, rockets and embedded particles',bindings=BINDINGS,particleOnly=['SiegeEngineImpact'],receipt='siege-engine-effects-sources.json',prefix='Assets/SiegeEngineEffects/',raw='SourceAssets/SiegeEngineEffects/',artFile='siege-engine-effects.json',modelsFile='siege-engine-effect-models.json',licenseFile='Assets/Licenses/Siege-Engine-Effects-W3ModelViewer-MIT.txt',generators=['scripts/import-frost-siege-engine-effects.py','scripts/warcraft-assets/EffectExport.cs','scripts/warcraft-assets/MdxExport.csproj']))

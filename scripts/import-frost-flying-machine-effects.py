"""Author: MiYu. Preserve Flying Machine instant hit, bomb and Flak Cannon effects."""
import importlib

BINDINGS = [('FlyingMachineImpact','Abilities/Weapons/GyroCopter/GyroCopterImpact.mdx'),('FlyingMachineBomb','Abilities/Weapons/GyroCopter/GyroCopterMissile.mdx'),('FlyingMachineFlak','Abilities/Spells/Human/FlakCannons/FlakTarget.mdx'),('ClassicFlyingMachineEmbedded','Units/Human/GyroCopter/Gyrocopter_V1.mdx'),('ClassicFlyingMachinePortraitEmbedded','Units/Human/GyroCopter/Gyrocopter_V1_portrait.mdx')]

if __name__=='__main__':
    importlib.import_module('import-frost-blademaster-effects').main(dict(description=__doc__,label='original Flying Machine effects',runtimeIntegrated=True,source='Original Warcraft III Flying Machine impacts, bombs and Flak Cannons',bindings=BINDINGS,particleOnly=['FlyingMachineFlak'],receipt='flying-machine-effects-sources.json',prefix='Assets/FlyingMachineEffects/',raw='SourceAssets/FlyingMachineEffects/',artFile='flying-machine-effects.json',modelsFile='flying-machine-effect-models.json',licenseFile='Assets/Licenses/Flying-Machine-Effects-W3ModelViewer-MIT.txt',generators=['scripts/import-frost-flying-machine-effects.py','scripts/warcraft-assets/EffectExport.cs','scripts/warcraft-assets/MdxExport.csproj']))

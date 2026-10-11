"""Author: MiYu. Reproduce the original overhead Magic Sentry caster effect."""
import importlib

if __name__ == '__main__':
    importlib.import_module('import-frost-blademaster-effects').main(dict(description=__doc__, label='original Magic Sentry effect', runtimeIntegrated=True, source='Original Warcraft III Magic Sentry caster effect', bindings=[('MagicSentryCaster', 'Abilities/Spells/Human/MagicSentry/MagicSentryCaster.mdx')], receipt='human-sentry-effects-sources.json', prefix='Assets/HumanSentryEffects/', raw='SourceAssets/HumanSentryEffects/', artFile='human-sentry-effects.json', modelsFile='human-sentry-effect-models.json', licenseFile='Assets/Licenses/Human-Sentry-Effects-W3ModelViewer-MIT.txt', generators=['scripts/import-frost-human-sentry-effects.py','scripts/warcraft-assets/EffectExport.cs','scripts/warcraft-assets/MdxExport.csproj']))

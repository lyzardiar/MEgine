"""Author: MiYu. Preserve the animated original mesh emitted by Chain Lightning's PREM node."""
import importlib


if __name__ == '__main__':
    importlib.import_module('import-frost-orc-hero-art').main(dict(description=__doc__, bindings=[('Lightning2', 'ClassicLightningParticle', 'SharedModels/Lightning2')], portraits=False, receipt='farseer-particle-sources.json', prefix='Assets/FarseerParticles/', raw='SourceAssets/Farseer/particles/', modelsFile='farseer-particle-models.json', sourceLicenseFile='Assets/Licenses/Classic-Farseer-Particles.txt', licenseFile='Assets/Licenses/Farseer-Particles-W3ModelViewer-MIT.txt', generators=['scripts/import-frost-farseer-particles.py']))
